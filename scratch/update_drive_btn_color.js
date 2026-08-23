const fs = require('fs');

const updatedDriveCss = `
        .action-btn {
            background: #102a96;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
            color: #ffffff !important;
            cursor: pointer;
            border: 1.5px solid rgba(255, 255, 255, 0.2);
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 4px 10px rgba(16, 42, 150, 0.25);
        }

        .action-btn:hover {
            background: #2563eb;
            color: #ffffff !important;
            border-color: #ffffff;
            transform: scale(1.1);
        }

        .action-btn.delete {
            background: #ff6b00 !important;
            color: #ffffff !important;
            border: 1.5px solid rgba(255, 255, 255, 0.25) !important;
            box-shadow: 0 4px 10px rgba(255, 107, 0, 0.35) !important;
        }

        .action-btn.delete:hover {
            background: #e65100 !important;
            color: #ffffff !important;
            border-color: #ffffff !important;
            transform: scale(1.12) !important;
            box-shadow: 0 6px 14px rgba(255, 107, 0, 0.5) !important;
        }
`;

['project/frontend/public/drive.html', 'project/frontend/drive.html'].forEach(p => {
  let content = fs.readFileSync(p, 'utf8');
  
  const regex = /\.action-btn\s*\{[\s\S]*?\.action-btn\.delete:hover\s*\{[\s\S]*?\}/i;
  if (regex.test(content)) {
    content = content.replace(regex, updatedDriveCss.trim());
    fs.writeFileSync(p, content, 'utf8');
    console.log('Updated action-btn styles in', p);
  } else {
    // Append before </style>
    content = content.replace('</style>', updatedDriveCss + '\n    </style>');
    fs.writeFileSync(p, content, 'utf8');
    console.log('Appended action-btn styles in', p);
  }
});
