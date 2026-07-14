# Tech Turf "Client Connect" Portal

This folder contains a fully decoupled, static, client-facing portal designed for external Tech Turf CRM clients. It operates as an independent client-side application that communicates with the centralized Express backend over the HTTP API space.

## 🚀 Deployment Instructions

### 1. Static Web Hosting
Because this folder has no runtime backend dependencies, it can be deployed to any static site provider (e.g., Netlify, Vercel, Nginx, or AWS S3).
- **Target Directory**: `project/frontend/client-portal/`
- **Subdomain Routing**: Usually mapped to `connect.techturf.com` or similar.

### 2. Environment Variables (.env)
The backend requires appropriate origin registration to allow cross-origin requests (CORS). Add the following variables to your `project/.env` configuration:
```env
MAIN_FRONTEND_ORIGIN=http://localhost:3000
CLIENT_PORTAL_ORIGIN=http://localhost:5000
```
*(Replace with production hostnames in live deployments)*

### 3. API Connection Configuration
Open `project/frontend/client-portal/js/api.js` and set the `API_BASE_URL` to point to the address of your backend server API:
```javascript
const API_BASE_URL = 'http://localhost:3000/api/client-portal';
```

---

## 🔒 Credentials Provisioning Flow

Clients cannot sign up themselves. Access credentials must be provisioned internally by authenticated staff handlers:

1. **Endpoint**: `POST /api/clients/:id/provision-login` (Admin/Client Handler only).
2. **Behavior**:
   - Generates a unique, formatted login ID: `TT-CLI-XXXXX` (padded client database ID).
   - Generates a secure, temporary password.
   - Hashes and updates the client record with active status.
3. **Response Output**:
   ```json
   {
     "message": "Client portal login provisioned successfully",
     "client_login_id": "TT-CLI-00004",
     "temp_password": "TT-F8E39A2C$9z"
   }
   ```
4. Hand these credentials to the client for their first login. Once logged in, the client is forced to change their temporary password under **Update Password** page to maintain account security.

---

## 🎨 Layout and Theme Sync

The look and feel of the Client Connect portal is synchronized with the main Tech Turf CRM theme (Dark background, border glows, Rajdhani/Orbitron fonts, and blue/indigo highlights). 
- Variables are defined inside `:root` block in `css/client-portal.css`.
- If the core CRM brand colors change, copy and replace the updated `:root` variables block from the main CRM styling sheet into `css/client-portal.css`.
