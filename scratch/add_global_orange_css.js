const fs = require('fs');

const globalOrangeBtnCss = `
/* Secure Drive Action Buttons */
.drive-item .action-btn {
  background: #102a96 !important;
  color: #ffffff !important;
  border: 1.5px solid rgba(255, 255, 255, 0.25) !important;
  box-shadow: 0 4px 10px rgba(16, 42, 150, 0.25) !important;
}

.drive-item .action-btn:hover {
  background: #2563eb !important;
  transform: scale(1.1) !important;
}

.drive-item .action-btn.delete {
  background: #ff6b00 !important;
  color: #ffffff !important;
  border: 1.5px solid rgba(255, 255, 255, 0.25) !important;
  box-shadow: 0 4px 10px rgba(255, 107, 0, 0.35) !important;
}

.drive-item .action-btn.delete:hover {
  background: #e65100 !important;
  color: #ffffff !important;
  border-color: #ffffff !important;
  transform: scale(1.12) !important;
  box-shadow: 0 6px 14px rgba(255, 107, 0, 0.5) !important;
}
`;

['project/frontend/public/css/main.css', 'project/frontend/css/main.css'].forEach(p => {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('.drive-item .action-btn.delete')) {
    c += '\n' + globalOrangeBtnCss;
    fs.writeFileSync(p, c, 'utf8');
    console.log('Appended orange delete button style to', p);
  }
});
