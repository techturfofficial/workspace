const fs = require('fs');
fs.copyFileSync('project/frontend/public/js/payments_hub.js', 'project/frontend/js/payments_hub.js');
console.log('Synced payments_hub.js across both frontend directories');
