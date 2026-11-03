let canvas;
let currentTool = 'select';
let isPanning = false;
let isSpaceDown = false;
let lastPosX, lastPosY;
let brushColor = '#1a1a1a';
let brushSize = 3;
let stickyColor = '#ffffff';

let historyStack = [];
let historyIndex = -1;
let isHistoryLocked = false;
const MAX_HISTORY = 50;

let saveTimeout;
let isSaving = false;
let chatBusy = false;

const STICKY_COLORS = ['#fff59d', '#ffcc80', '#a5d6a7', '#90caf9', '#f48fb1'];

document.addEventListener('DOMContentLoaded', async () => {
    auth.requireAuth();
    initUserAvatar();
    initCanvas();
    setupEventListeners();
    initSideDock();
    setTool('select');
    await loadWorkspace();
    if (historyStack.length === 0) pushHistory();
});

function initUserAvatar() {
    const el = document.getElementById('user-avatar');
    const user = auth.getUser();
    if (!el || !user) return;
    const initials = (user.name || 'TT').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    el.textContent = initials;
    el.title = user.name || 'Your Profile';
}

function initCanvas() {
    try {
        const originalRenderBg = fabric.Textbox.prototype._renderBackground;
        fabric.Textbox.prototype._renderBackground = function (ctx) {
            originalRenderBg.call(this, ctx);
            if (this.noteType === 'sticky') return;
            const w = this.width + (this.padding * 2);
            const h = this.height + (this.padding * 2);
            const x = -this.width / 2 - this.padding;
            const y = -this.height / 2 - this.padding;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
        };

        canvas = new fabric.Canvas('whiteboard-canvas', {
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: 'transparent',
            isDrawingMode: false,
            selection: true,
            preserveObjectStacking: true
        });

        window.addEventListener('resize', () => {
            canvas.setWidth(window.innerWidth);
            canvas.setHeight(window.innerHeight);
            canvas.renderAll();
            updateImageToolbar();
        });

        canvas.on('object:modified', () => { pushHistory(); saveWorkspaceDebounced(); updateLayersPanel(); });
        canvas.on('path:created', (opt) => {
            if (currentTool === 'eraser') {
                const eraserPath = opt.path;
                const objects = canvas.getObjects().filter(obj => obj !== eraserPath);

                let erasedCount = 0;
                objects.forEach(obj => {
                    if (eraserPath.intersectsWithObject(obj)) {
                        canvas.remove(obj);
                        erasedCount++;
                    }
                });

                canvas.remove(eraserPath);
                canvas.renderAll();

                if (erasedCount > 0) {
                    pushHistory();
                    saveWorkspaceDebounced();
                    updateLayersPanel();
                }
                return;
            }
            pushHistory();
            saveWorkspaceDebounced();
            updateLayersPanel();
        });
        canvas.on('object:added', (e) => {
            if (!e.target.isType('path')) {
                e.target.set('erasable', true);
                if (!isHistoryLocked) {
                    pushHistory();
                    saveWorkspaceDebounced();
                    updateLayersPanel();
                }
            }
        });
        canvas.on('object:removed', () => {
            if (!isHistoryLocked) {
                pushHistory();
                saveWorkspaceDebounced();
                updateLayersPanel();
            }
        });
        canvas.on('selection:created', () => { updateImageToolbar(); highlightLayerSelection(); });
        canvas.on('selection:updated', () => { updateImageToolbar(); highlightLayerSelection(); });
        canvas.on('selection:cleared', () => { updateImageToolbar(); highlightLayerSelection(); });
        canvas.on('object:moving', updateImageToolbar);
        canvas.on('object:scaling', updateImageToolbar);
        canvas.on('object:rotating', updateImageToolbar);
    } catch (err) {
        console.error('Canvas initialization failed:', err);
        showToast('Canvas failed to load', 'error');
    }
}

function setupEventListeners() {
    const safeListen = (id, event, fn) => {
        const el = document.getElementById(id) || document.querySelector(id);
        if (el) el.addEventListener(event, fn);
    };

    safeListen('tool-select', 'click', () => setTool('select'));
    safeListen('tool-pencil', 'click', () => setTool('pencil'));
    safeListen('tool-sticky', 'click', () => setTool('sticky'));
    safeListen('tool-rect', 'click', () => setTool('rect'));
    safeListen('tool-circle', 'click', () => setTool('circle'));
    safeListen('tool-arrow', 'click', () => setTool('arrow'));
    safeListen('tool-text', 'click', () => setTool('text'));
    safeListen('tool-eraser', 'click', () => setTool('eraser'));
    safeListen('tool-image', 'click', () => document.getElementById('image-upload').click());
    safeListen('tool-undo', 'click', undo);
    safeListen('tool-redo', 'click', redo);

    safeListen('tool-clear', 'click', async () => {
        if (await confirmDialog('Clear entire canvas? This cannot be undone easily.', { confirmText: 'Clear' })) {
            isHistoryLocked = true;
            canvas.clear();
            isHistoryLocked = false;
            pushHistory();
            saveWorkspace();
            updateLayersPanel();
        }
    });

    safeListen('image-upload', 'change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (oImg) => {
                oImg.scaleToWidth(300);
                canvas.add(oImg);
                canvas.centerObject(oImg);
                canvas.setActiveObject(oImg);
                canvas.renderAll();
                showToast('Image imported', 'success');
            });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    safeListen('zoom-in', 'click', () => adjustZoom(0.1));
    safeListen('zoom-out', 'click', () => adjustZoom(-0.1));
    safeListen('zoom-fit', 'click', resetZoom);

    safeListen('.settings-icon', 'click', toggleSettings);
    safeListen('close-settings', 'click', toggleSettings);
    safeListen('.btn-share', 'click', shareWorkspace);
    safeListen('.workspace-title-edit-icon', 'click', editTitle);
    safeListen('wb-title', 'click', editTitle);
    safeListen('btn-export', 'click', exportCanvas);
    safeListen('btn-boards', 'click', openBoardsModal);
    safeListen('close-boards', 'click', closeBoardsModal);
    safeListen('btn-new-board', 'click', createNewBoard);

    document.querySelectorAll('.color-swatch[data-color]').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch[data-color]').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            brushColor = swatch.dataset.color;
            updateBrushSettings();
        });
    });

    document.querySelectorAll('.sticky-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.sticky-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            stickyColor = swatch.dataset.sticky;
        });
    });

    safeListen('brush-size', 'input', (e) => {
        brushSize = parseInt(e.target.value, 10);
        document.getElementById('brush-size-val').innerText = brushSize + 'px';
        updateBrushSettings();
    });

    safeListen('save-settings', 'click', toggleSettings);

    safeListen('.minimize-chat', 'click', () => {
        const panel = document.querySelector('.nexus-chat-panel');
        panel.classList.toggle('minimized');
        const icon = document.querySelector('.minimize-chat');
        if (panel.classList.contains('minimized')) {
            icon.classList.replace('fa-minus', 'fa-expand-alt');
        } else {
            icon.classList.replace('fa-expand-alt', 'fa-minus');
        }
    });

    safeListen('add-custom-link-btn', 'click', () => {
        document.getElementById('link-modal').style.display = 'flex';
    });
    safeListen('close-link', 'click', () => { document.getElementById('link-modal').style.display = 'none'; });
    safeListen('save-link', 'click', saveCustomLink);
    renderCustomShortcuts();

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveWorkspace();
            }
            return;
        }

        if (e.code === 'Space') {
            isSpaceDown = true;
            canvas.defaultCursor = 'grab';
            e.preventDefault();
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault();
            redo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveWorkspace();
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'v': setTool('select'); break;
            case 'p': setTool('pencil'); break;
            case 's': setTool('sticky'); break;
            case 'r': setTool('rect'); break;
            case 'o': setTool('circle'); break;
            case 'a': setTool('arrow'); break;
            case 't': setTool('text'); break;
            case 'i': document.getElementById('image-upload').click(); break;
            case 'e': setTool('eraser'); break;
            case 'backspace':
            case 'delete': {
                const activeObjects = canvas.getActiveObjects();
                if (activeObjects.length > 0) {
                    const activeObj = canvas.getActiveObject();
                    if (activeObj && activeObj.isEditing) return;
                    activeObjects.forEach(obj => canvas.remove(obj));
                    canvas.discardActiveObject();
                    canvas.renderAll();
                }
                break;
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            isSpaceDown = false;
            canvas.defaultCursor = 'default';
        }
    });

    canvas.on('mouse:down', (opt) => {
        const evt = opt.e;
        if (evt.button === 1 || evt.altKey === true || isSpaceDown) {
            isPanning = true;
            canvas.selection = false;
            canvas.defaultCursor = 'grabbing';
            lastPosX = evt.clientX;
            lastPosY = evt.clientY;
        } else if (evt.button === 0 && !['select', 'pencil', 'eraser'].includes(currentTool)) {
            createShape(opt);
        }
    });

    canvas.on('mouse:move', (opt) => {
        if (isPanning) {
            const e = opt.e;
            const vpt = canvas.viewportTransform;
            vpt[4] += e.clientX - lastPosX;
            vpt[5] += e.clientY - lastPosY;
            canvas.requestRenderAll();
            lastPosX = e.clientX;
            lastPosY = e.clientY;
            updateImageToolbar();
            updateBackgroundGrid();
        }
    });

    canvas.on('mouse:up', () => {
        canvas.setViewportTransform(canvas.viewportTransform);
        isPanning = false;
        canvas.selection = true;
        canvas.defaultCursor = isSpaceDown ? 'grab' : 'default';
        updateImageToolbar();
        updateBackgroundGrid();
    });

    canvas.on('mouse:wheel', (opt) => {
        const e = opt.e;
        if (e.ctrlKey) {
            let z = canvas.getZoom();
            z *= 0.999 ** e.deltaY;
            z = Math.min(20, Math.max(0.01, z));
            canvas.zoomToPoint({ x: e.offsetX, y: e.offsetY }, z);
            updateZoomLabel(z);
        } else {
            const vpt = canvas.viewportTransform;
            vpt[4] -= e.deltaX;
            vpt[5] -= e.deltaY;
            canvas.requestRenderAll();
        }
        e.preventDefault();
        e.stopPropagation();
        updateImageToolbar();
        updateBackgroundGrid();
    });

    setupImageToolbar();
    safeListen('chat-send', 'click', sendMessage);
    safeListen('chat-textarea', 'keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

function initSideDock() {
    const dock = document.getElementById('side-dock');
    const handle = document.getElementById('dock-handle');
    if (!dock || !handle) return;

    document.querySelectorAll('.dock-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.dock-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.dock-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById('dock-' + tab.dataset.tab);
            if (panel) panel.classList.add('active');
            dock.classList.add('open');
        });
    });

    handle.addEventListener('click', () => dock.classList.toggle('open'));
}

function updateImageToolbar() {
    const imageToolbar = document.getElementById('image-toolbar');
    if (!imageToolbar || !canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj && activeObj.type === 'image') {
        const topCenter = activeObj.getPointByOrigin('center', 'top');
        const vpPoint = fabric.util.transformPoint(topCenter, canvas.viewportTransform);
        const canvasRect = canvas.getElement().getBoundingClientRect();
        let screenTop = canvasRect.top + vpPoint.y - 20;
        if (screenTop < 100) screenTop = 100;
        imageToolbar.style.display = 'flex';
        imageToolbar.style.left = (canvasRect.left + vpPoint.x) + 'px';
        imageToolbar.style.top = screenTop + 'px';
    } else {
        imageToolbar.style.display = 'none';
    }
}

function setupImageToolbar() {
    let editingObj = null;

    function handleToolbarClick(e, action) {
        const activeObj = canvas.getActiveObject();
        if (!activeObj || activeObj.type !== 'image') return;
        e.stopPropagation();
        e.preventDefault();

        switch (action) {
            case 'border': {
                const colors = [null, '#ffffff', '#102a96', '#4dff4d', '#ff4d4d'];
                const currentIdx = colors.indexOf(activeObj.stroke);
                const nextIdx = (currentIdx + 1) % colors.length;
                activeObj.set({ stroke: colors[nextIdx], strokeWidth: colors[nextIdx] ? 4 : 0, strokeUniform: true });
                break;
            }
            case 'resize':
                activeObj.scale(1).set({ angle: 0 });
                canvas.centerObject(activeObj);
                updateImageToolbar();
                break;
            case 'send-back':
                activeObj.sendToBack();
                break;
            case 'bring-front':
                activeObj.bringToFront();
                break;
            case 'tag': {
                const tagName = prompt('Enter tag name:');
                if (tagName) {
                    const textTag = new fabric.Text(tagName.toUpperCase(), {
                        left: activeObj.left + (activeObj.width * activeObj.scaleX / 2),
                        top: activeObj.top + (activeObj.height * activeObj.scaleY) + 10,
                        fontSize: 14,
                        fill: '#ffffff',
                        backgroundColor: '#102a96',
                        padding: 6,
                        fontFamily: 'Rajdhani',
                        fontWeight: 'bold',
                        originX: 'center',
                        erasable: true
                    });
                    canvas.add(textTag);
                }
                break;
            }
            case 'filter':
                openImageEditor(activeObj);
                return;
            case 'crop':
                performCenterCrop(activeObj);
                break;
            case 'download':
                downloadImage(activeObj);
                return;
        }
        canvas.renderAll();
        saveWorkspaceDebounced();
        updateLayersPanel();
    }

    function openImageEditor(obj) {
        editingObj = obj;
        document.getElementById('editor-modal').style.display = 'flex';
        document.getElementById('editor-preview-img').src = obj.src || obj._element.src;
        document.getElementById('filter-brightness').value = 0;
        document.getElementById('filter-contrast').value = 0;
    }

    function applyFilters() {
        if (!editingObj) return;
        const brightness = parseFloat(document.getElementById('filter-brightness').value);
        const contrast = parseFloat(document.getElementById('filter-contrast').value);
        editingObj.filters = [];
        if (brightness !== 0) editingObj.filters.push(new fabric.Image.filters.Brightness({ brightness }));
        if (contrast !== 0) editingObj.filters.push(new fabric.Image.filters.Contrast({ contrast }));
        editingObj.applyFilters();
        canvas.renderAll();
        saveWorkspaceDebounced();
        closeEditor();
        showToast('Filters applied', 'success');
    }

    function addPresetFilter(type) {
        if (!editingObj) return;
        let filter;
        switch (type) {
            case 'grayscale': filter = new fabric.Image.filters.Grayscale(); break;
            case 'sepia': filter = new fabric.Image.filters.Sepia(); break;
            case 'invert': filter = new fabric.Image.filters.Invert(); break;
            case 'pixelate': filter = new fabric.Image.filters.Pixelate({ blocksize: 8 }); break;
            case 'blur': filter = new fabric.Image.filters.Blur({ blur: 0.5 }); break;
        }
        if (filter) {
            editingObj.filters.push(filter);
            editingObj.applyFilters();
            canvas.renderAll();
        }
    }

    function performCenterCrop(obj) {
        const size = Math.min(obj.width, obj.height);
        obj.set({ cropX: (obj.width - size) / 2, cropY: (obj.height - size) / 2, width: size, height: size });
        obj.setCoords();
        canvas.renderAll();
        saveWorkspaceDebounced();
        showToast('Square crop applied', 'success');
    }

    function downloadImage(obj) {
        try {
            const link = document.createElement('a');
            link.download = `tech-turf-export-${Date.now()}.png`;
            link.href = obj.toDataURL({ format: 'png', quality: 1 });
            link.click();
            showToast('Image download started', 'success');
        } catch {
            showToast('Download failed (cross-origin image)', 'error');
        }
    }

    function closeEditor() {
        document.getElementById('editor-modal').style.display = 'none';
        editingObj = null;
    }

    const safeListen = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
    };

    safeListen('close-editor', 'click', closeEditor);
    safeListen('cancel-editor', 'click', closeEditor);
    safeListen('apply-editor', 'click', applyFilters);
    safeListen('filter-reset', 'click', () => {
        if (editingObj) {
            editingObj.filters = [];
            editingObj.applyFilters();
            canvas.renderAll();
        }
    });
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => addPresetFilter(btn.dataset.filter));
    });

    safeListen('ctx-border', 'click', (e) => handleToolbarClick(e, 'border'));
    safeListen('ctx-resize', 'click', (e) => handleToolbarClick(e, 'resize'));
    safeListen('ctx-send-back', 'click', (e) => handleToolbarClick(e, 'send-back'));
    safeListen('ctx-bring-front', 'click', (e) => handleToolbarClick(e, 'bring-front'));
    safeListen('ctx-tag', 'click', (e) => handleToolbarClick(e, 'tag'));
    safeListen('ctx-edit', 'click', (e) => handleToolbarClick(e, 'filter'));
    safeListen('ctx-crop', 'click', (e) => handleToolbarClick(e, 'crop'));
    safeListen('ctx-download', 'click', (e) => handleToolbarClick(e, 'download'));
}

function pushHistory() {
    if (isHistoryLocked || !canvas) return;
    const json = JSON.stringify(canvas.toJSON(['globalCompositeOperation', 'erasable', 'noteType']));
    if (historyIndex >= 0 && historyStack[historyIndex] === json) return;
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(json);
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    } else {
        historyIndex++;
    }
    historyIndex = historyStack.length - 1;
    updateUndoRedoButtons();
}

function undo() {
    if (historyIndex <= 0 || !canvas) return;
    isHistoryLocked = true;
    historyIndex--;
    canvas.loadFromJSON(historyStack[historyIndex], () => {
        canvas.getObjects().forEach(obj => obj.set('erasable', true));
        canvas.renderAll();
        isHistoryLocked = false;
        updateLayersPanel();
        updateImageToolbar();
        updateUndoRedoButtons();
    });
}

function redo() {
    if (historyIndex >= historyStack.length - 1 || !canvas) return;
    isHistoryLocked = true;
    historyIndex++;
    canvas.loadFromJSON(historyStack[historyIndex], () => {
        canvas.getObjects().forEach(obj => obj.set('erasable', true));
        canvas.renderAll();
        isHistoryLocked = false;
        updateLayersPanel();
        updateImageToolbar();
        updateUndoRedoButtons();
    });
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('tool-undo');
    const redoBtn = document.getElementById('tool-redo');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

function updateLayersPanel() {
    const list = document.getElementById('layers-list');
    if (!list || !canvas) return;
    const objects = canvas.getObjects().slice().reverse();
    if (objects.length === 0) {
        list.innerHTML = '<li class="layers-empty">No objects yet</li>';
        return;
    }
    list.innerHTML = objects.map((obj, idx) => {
        const realIdx = canvas.getObjects().length - 1 - idx;
        const label = getObjectLabel(obj, realIdx);
        const hidden = obj.visible === false ? ' hidden-layer' : '';
        return `<li class="layer-item${hidden}" data-idx="${realIdx}">
            <span class="layer-label">${label}</span>
            <span class="layer-actions">
                <i class="fas fa-eye layer-toggle" title="Toggle visibility"></i>
                <i class="fas fa-trash layer-delete" title="Delete"></i>
            </span>
        </li>`;
    }).join('');

    list.querySelectorAll('.layer-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.layer-actions')) return;
            const idx = parseInt(item.dataset.idx, 10);
            const obj = canvas.item(idx);
            if (obj) {
                canvas.setActiveObject(obj);
                canvas.renderAll();
            }
        });
        item.querySelector('.layer-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(item.dataset.idx, 10);
            const obj = canvas.item(idx);
            if (obj) {
                obj.set('visible', !obj.visible);
                canvas.renderAll();
                updateLayersPanel();
            }
        });
        item.querySelector('.layer-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(item.dataset.idx, 10);
            canvas.remove(canvas.item(idx));
            canvas.renderAll();
        });
    });
}

function getObjectLabel(obj, idx) {
    if (obj.noteType === 'sticky') return `Sticky ${idx + 1}`;
    if (obj.type === 'image') return `Image ${idx + 1}`;
    if (obj.type === 'textbox' || obj.type === 'text') return (obj.text || 'Text').slice(0, 20) || `Text ${idx + 1}`;
    if (obj.type === 'rect') return `Rectangle ${idx + 1}`;
    if (obj.type === 'circle') return `Circle ${idx + 1}`;
    if (obj.type === 'group') return `Arrow ${idx + 1}`;
    if (obj.type === 'path') return `Drawing ${idx + 1}`;
    return `Object ${idx + 1}`;
}

function highlightLayerSelection() {
    const active = canvas.getActiveObject();
    document.querySelectorAll('.layer-item').forEach(el => el.classList.remove('selected'));
    if (!active) return;
    const idx = canvas.getObjects().indexOf(active);
    const item = document.querySelector(`.layer-item[data-idx="${idx}"]`);
    if (item) item.classList.add('selected');
}

function updateBrushSettings() {
    if (!canvas || !canvas.isDrawingMode) return;
    if (currentTool === 'eraser') {
        if (fabric.EraserBrush) {
            if (!(canvas.freeDrawingBrush instanceof fabric.EraserBrush)) {
                canvas.freeDrawingBrush = new fabric.EraserBrush(canvas);
            }
            canvas.freeDrawingBrush.width = brushSize * 10;
        }
    } else {
        if (!(canvas.freeDrawingBrush instanceof fabric.PencilBrush)) {
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        }
        canvas.freeDrawingBrush.color = brushColor;
        canvas.freeDrawingBrush.width = brushSize;
    }
}

function setTool(toolName) {
    currentTool = toolName;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    const toolEl = document.getElementById(`tool-${toolName}`);
    if (toolEl) toolEl.classList.add('active');

    canvas.isDrawingMode = (toolName === 'pencil' || toolName === 'eraser');

    if (canvas.isDrawingMode) {
        if (toolName === 'eraser') {
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
            canvas.freeDrawingBrush.width = 20;
            canvas.freeDrawingBrush.color = 'rgba(16, 42, 150, 0.4)'; // Light blue translucent trial
        } else {
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
            canvas.freeDrawingBrush.color = brushColor;
            canvas.freeDrawingBrush.width = brushSize;
        }
    }
}

function createShape(opt) {
    const pointer = canvas.getPointer(opt.e);
    let shape;

    const commonProps = {
        left: pointer.x,
        top: pointer.y,
        fill: 'transparent',
        stroke: brushColor,
        strokeWidth: 2,
        erasable: true
    };

    switch (currentTool) {
        case 'rect':
            shape = new fabric.Rect({ ...commonProps, width: 100, height: 100 });
            break;
        case 'circle':
            shape = new fabric.Circle({ ...commonProps, radius: 50 });
            break;
        case 'arrow':
            shape = createArrowShape(pointer.x, pointer.y);
            break;
        case 'sticky':
            shape = new fabric.Textbox('Type your idea…', {
                left: pointer.x,
                top: pointer.y,
                width: 200,
                fontSize: 16,
                fill: '#1a1a1a',
                fontFamily: 'Rajdhani',
                fontWeight: '500',
                backgroundColor: stickyColor,
                padding: 14,
                noteType: 'sticky',
                erasable: true,
                editingBorderColor: 'rgba(0,0,0,0.2)',
                cornerColor: 'rgba(0,0,0,0.4)'
            });
            break;
        case 'text':
            shape = new fabric.Textbox('', {
                left: pointer.x,
                top: pointer.y - 15,
                width: 350,
                padding: 16,
                fill: brushColor,
                fontFamily: 'Rajdhani',
                fontSize: 18,
                backgroundColor: 'rgba(20, 20, 20, 0.85)',
                splitByGrapheme: false,
                editingBorderColor: 'rgba(255, 255, 255, 0.4)',
                transparentCorners: false,
                cornerColor: 'rgba(255, 255, 255, 0.8)',
                cornerSize: 8,
                erasable: true
            });
            break;
    }

    if (shape) {
        canvas.add(shape);
        canvas.setActiveObject(shape);

        if (currentTool === 'text' || currentTool === 'sticky') {
            shape.enterEditing();
            shape.hiddenTextarea.focus();
            shape.on('editing:exited', () => {
                if (!shape.text || shape.text.trim() === '' || shape.text === 'Type your idea…') {
                    if (currentTool === 'sticky' && shape.text === 'Type your idea…') {
                        canvas.remove(shape);
                    } else if (currentTool === 'text' && !shape.text.trim()) {
                        canvas.remove(shape);
                    }
                }
                canvas.renderAll();
            });
        }

        setTool('select');
    }
}

function createArrowShape(x, y) {
    const line = new fabric.Line([0, 0, 100, 0], {
        stroke: brushColor,
        strokeWidth: 3,
        originX: 'left',
        originY: 'center'
    });
    const head = new fabric.Triangle({
        left: 100,
        top: 0,
        width: 14,
        height: 14,
        fill: brushColor,
        angle: 90,
        originX: 'center',
        originY: 'center'
    });
    return new fabric.Group([line, head], {
        left: x,
        top: y,
        erasable: true
    });
}

function adjustZoom(delta) {
    let z = canvas.getZoom();
    z = Math.min(20, Math.max(0.01, z + delta));
    canvas.setZoom(z);
    updateZoomLabel(z);
    updateImageToolbar();
    updateBackgroundGrid();
}

function resetZoom() {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setZoom(1);
    updateZoomLabel(1);
    updateImageToolbar();
    updateBackgroundGrid();
}

function updateZoomLabel(zoom) {
    const el = document.getElementById('zoom-level');
    if (el) el.innerText = Math.round(zoom * 100) + '%';
}

function setSaveStatus(state, message) {
    const el = document.getElementById('save-status');
    if (!el) return;

    const dot = el.querySelector('.status-dot');
    const text = el.querySelector('span');

    const labels = { ready: 'Ready', saving: 'Saving…', saved: 'Saved', error: 'Save failed' };
    const colors = { ready: '#888', saving: '#ffd54f', saved: '#43e97b', error: '#ff4d4d' };

    if (text) text.innerText = message || labels[state] || state;
    if (dot) {
        dot.style.background = colors[state] || '#888';
        dot.style.boxShadow = `0 0 8px ${colors[state] || '#888'}`;
        if (state === 'saving') {
            dot.style.animation = 'pulse 1s infinite';
        } else {
            dot.style.animation = 'none';
        }
    }
}

function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.style.display = (modal.style.display === 'none' || !modal.style.display) ? 'flex' : 'none';
    }
}

async function shareWorkspace() {
    await saveWorkspace();
    const url = window.location.href;
    try {
        await navigator.clipboard.writeText(url);
        showToast('Share link copied!', 'success');
    } catch {
        showToast('Could not copy link', 'error');
    }
}

function editTitle() {
    const titleEl = document.getElementById('wb-title');
    const newTitle = prompt('Enter workspace title:', titleEl.innerText);
    if (newTitle && newTitle.trim()) {
        titleEl.innerText = newTitle.trim().toUpperCase();
        saveWorkspace();
    }
}

function saveWorkspaceDebounced() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWorkspace, 2000);
}

async function saveWorkspace() {
    if (!canvas || isSaving) return;
    isSaving = true;
    setSaveStatus('saving');

    const content = JSON.stringify(canvas.toJSON(['globalCompositeOperation', 'erasable', 'noteType']));
    const preview = canvas.toDataURL({ format: 'png', quality: 0.1, multiplier: 0.15 });
    const title = document.getElementById('wb-title').innerText;

    try {
        const res = await api.post('/workspace/save', {
            id: window.workspaceId || undefined,
            title,
            content_json: content,
            last_preview_base64: preview
        });
        if (res && res.success) {
            window.workspaceId = res.id;
            if (!window.location.search.includes('id=')) {
                const newUrl = `${window.location.pathname}?id=${res.id}`;
                window.history.replaceState({}, '', newUrl);
            }
            setSaveStatus('saved');
        } else {
            setSaveStatus('error');
        }
    } catch (err) {
        console.error('Save failed:', err.message);
        setSaveStatus('error');
    } finally {
        isSaving = false;
    }
}

async function loadWorkspace() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if (!id) {
        setSaveStatus('ready');
        return;
    }

    window.workspaceId = id;
    try {
        const res = await api.get(`/workspace/${id}`);
        if (res && res.content_json) {
            isHistoryLocked = true;
            canvas.loadFromJSON(res.content_json, () => {
                canvas.getObjects().forEach(obj => obj.set('erasable', true));
                canvas.renderAll();
                document.getElementById('wb-title').innerText = res.title || 'UNTITLED';
                isHistoryLocked = false;
                historyStack = [];
                historyIndex = -1;
                pushHistory();
                updateLayersPanel();
                setSaveStatus('saved');
                updateBackgroundGrid();
            });
        }
    } catch (err) {
        console.error('Load failed:', err);
        showToast('Could not load board', 'error');
        setSaveStatus('error');
    }
}

function exportCanvas() {
    if (!canvas) return;
    const prevTransform = canvas.viewportTransform.slice();
    const prevZoom = canvas.getZoom();
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setZoom(1);

    const dataURL = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
    const link = document.createElement('a');
    link.download = `tech-turf-board-${Date.now()}.png`;
    link.href = dataURL;
    link.click();

    canvas.setViewportTransform(prevTransform);
    canvas.setZoom(prevZoom);
    canvas.renderAll();
    showToast('Board exported as PNG', 'success');
}

async function openBoardsModal() {
    document.getElementById('boards-modal').style.display = 'flex';
    await loadBoardsList();
}

function closeBoardsModal() {
    document.getElementById('boards-modal').style.display = 'none';
}

async function loadBoardsList() {
    const grid = document.getElementById('boards-grid');
    grid.innerHTML = '<div class="boards-loading">Loading boards…</div>';
    try {
        const boards = await api.get('/workspace');
        if (!boards || boards.length === 0) {
            grid.innerHTML = '<div class="boards-empty">No boards yet. Create your first one!</div>';
            return;
        }
        grid.innerHTML = boards.map(b => `
            <div class="board-card" data-id="${b.id}">
                <div class="board-thumb">${b.last_preview_base64
                ? `<img src="${b.last_preview_base64}" alt="">`
                : '<i class="fas fa-chalkboard"></i>'}</div>
                <div class="board-info">
                    <div class="board-title">${escapeHtml(b.title || 'UNTITLED')}</div>
                    <div class="board-date">${formatBoardDate(b.updated_at || b.created_at)}</div>
                </div>
                <button class="board-delete" data-id="${b.id}" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');

        grid.querySelectorAll('.board-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.board-delete')) return;
                window.location.href = `workspace.html?id=${card.dataset.id}`;
            });
        });
        grid.querySelectorAll('.board-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!(await confirmDialog('Delete this board permanently?'))) return;
                try {
                    await api.delete(`/workspace/${btn.dataset.id}`);
                    showToast('Board deleted', 'success');
                    loadBoardsList();
                } catch {
                    showToast('Delete failed', 'error');
                }
            });
        });
    } catch {
        grid.innerHTML = '<div class="boards-empty">Failed to load boards</div>';
    }
}

function createNewBoard() {
    window.location.href = 'workspace.html';
}

function formatBoardDate(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function sendMessage() {
    if (chatBusy) return;
    const input = document.getElementById('chat-textarea');
    const text = input.value.trim();
    if (!text) return;

    const messages = document.getElementById('chat-messages');
    const noMessages = messages.querySelector('.no-messages');
    if (noMessages) noMessages.remove();

    appendChatMessage(text, 'user');
    input.value = '';
    messages.scrollTop = messages.scrollHeight;

    chatBusy = true;
    const thinking = appendChatMessage('Thinking…', 'nexus', true);

    try {
        const res = await api.post('/nexus/chat', { prompt: text });
        thinking.remove();
        appendChatMessage(res.response || 'No response received.', 'nexus');
    } catch (err) {
        thinking.remove();
        const fallback = getLocalNexusFallback(text);
        appendChatMessage(fallback, 'nexus');
    } finally {
        chatBusy = false;
        messages.scrollTop = messages.scrollHeight;
    }
}

function appendChatMessage(text, side, isTemp) {
    const messages = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = `message ${side}-message${isTemp ? ' thinking' : ''}`;
    if (side === 'user') {
        msg.innerHTML = `<div class="chat-bubble user-bubble">${escapeHtml(text)}</div>`;
    } else {
        msg.innerHTML = `<div class="chat-bubble nexus-bubble"><i class="fas fa-brain"></i> ${escapeHtml(text)}</div>`;
    }
    messages.appendChild(msg);
    return msg;
}

function getLocalNexusFallback(prompt) {
    const p = prompt.toLowerCase();
    if (p.includes('sticky') || p.includes('note')) return 'Try the sticky note tool (S) for quick ideas. Color-code notes by topic using Settings → Sticky Note Color.';
    if (p.includes('layout') || p.includes('organize')) return 'Group related items with arrows (A) for flows. Use the Layers panel to reorder elements. Zoom out (Ctrl+scroll) to see the full board.';
    if (p.includes('export') || p.includes('download')) return 'Use the Export button in the header to save your full board as PNG. Individual images can be downloaded from the image toolbar.';
    if (p.includes('brainstorm')) return 'Start with 3–5 sticky notes for themes, connect them with arrows, then add images from Drive or uploads for reference.';
    return 'Nexus AI is offline (OPENAI_API_KEY not configured). Use sticky notes, arrows, and layers to organize your ideas. Press S for sticky notes, A for arrows, Ctrl+Z to undo.';
}

function getCustomShortcuts() {
    try {
        const storage = localStorage.getItem('techTurfLinks');
        if (storage) return JSON.parse(storage);
    } catch { /* ignore */ }
    return [
        { name: 'ChatGPT', url: 'https://chat.openai.com' },
        { name: 'Figma', url: 'https://figma.com' },
        { name: 'Google', url: 'https://google.com' }
    ];
}

function saveCustomShortcuts(links) {
    localStorage.setItem('techTurfLinks', JSON.stringify(links));
}

function renderCustomShortcuts() {
    const list = document.getElementById('custom-links-container');
    if (!list) return;
    list.innerHTML = '';
    getCustomShortcuts().forEach((link, idx) => {
        const li = document.createElement('li');
        li.className = 'link-item';
        li.innerHTML = `
            <a href="${link.url}" target="_blank" rel="noopener">
                <img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}" width="16" height="16" alt="">
                ${escapeHtml(link.name)}
            </a>
            <i class="fas fa-times remove-link" data-idx="${idx}" title="Remove"></i>
        `;
        list.appendChild(li);
    });
    list.querySelectorAll('.remove-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const links = getCustomShortcuts();
            links.splice(parseInt(e.target.dataset.idx, 10), 1);
            saveCustomShortcuts(links);
            renderCustomShortcuts();
        });
    });
}

function saveCustomLink() {
    const name = document.getElementById('link-name').value.trim();
    let url = document.getElementById('link-url').value.trim();
    if (!name || !url) {
        showToast('Name and URL required', 'error');
        return;
    }
    if (!url.startsWith('http')) url = 'https://' + url;
    const links = getCustomShortcuts();
    links.push({ name, url });
    saveCustomShortcuts(links);
    renderCustomShortcuts();
    document.getElementById('link-name').value = '';
    document.getElementById('link-url').value = '';
    document.getElementById('link-modal').style.display = 'none';
    showToast('Link added', 'success');
}
function updateBackgroundGrid() {
    const container = document.querySelector('.workspace-container');
    if (!container || !canvas) return;
    const vpt = canvas.viewportTransform;
    const zoom = canvas.getZoom();
    container.style.backgroundPosition = `${vpt[4]}px ${vpt[5]}px`;
    container.style.backgroundSize = `${30 * zoom}px ${30 * zoom}px`;
}
