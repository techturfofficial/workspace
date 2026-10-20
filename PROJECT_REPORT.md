# Tech Turf CRM: Comprehensive Project Report

## 1. Executive Summary
**Tech Turf CRM** is an enterprise-grade agency management platform and client engagement ecosystem engineered specifically for digital content agencies, media production houses, and creative studios. The system addresses common operational bottlenecks in fast-paced agency environments—such as fragmented communication, delayed client approvals, disjointed asset management, and inconsistent work quality—by unifying internal workflow pipelines and external client interactions into a cohesive platform. Driven by role-based operational mechanics and automated AI evaluation engines, Tech Turf streamlines end-to-end agency lifecycles from onboarding and task execution to delivery, invoicing, and performance analytics.

## 2. Dual-Portal System Architecture
The platform features an asynchronous dual-portal architecture running on a centralized backend core:
* **Employee CRM Portal (Port 3000):** The primary internal workspace utilized by agency executives, team leaders, writers, designers, developers, and media specialists. It centralizes project pipelines, interactive task management, whiteboard ideation, real-time messaging, and multi-tier approval workflows.
* **Client Connect Portal (Port 5000 / Static App):** A fully decoupled, secure client-facing portal. Clients access personalized dashboards to monitor active project milestones, review deliverable drafts, schedule consultations, inspect invoices, submit support tickets, and provide feedback directly into the agency's database.

Both portals interface with a unified Node.js/Express API layer and a centralized SQLite database, ensuring real-time data consistency and zero sync latency between client requests and internal staff operations.

## 3. Core Functional Modules

### A. Intelligent Task & Multi-Tier Review Pipeline
Task execution follows a structured milestone pipeline with multi-assignee capabilities, task dependencies, revision caps, and automated SLA monitoring. Work items submitted by team members progress through a rigorous three-tiered review hierarchy:
1. **Nexus AI Evaluation:** Automated submission grading (0–100 scale) providing role-tailored critique on grammar, visual balance, code quality, or brief adherence.
2. **Team Leader Review:** Operational vetting where leaders approve, request rework, or reject items.
3. **Executive/Admin Sign-off:** Final quality gate with administrative override authority prior to client dispatch.

### B. Creative Workspace & Digital Asset Management
Tech Turf eliminates reliance on third-party cloud drives through integrated tools:
* **TechTurf Drive:** A high-throughput hierarchical storage system supporting chunked uploads, permission controls, and direct media streaming.
* **Design Vault & Creator Slate:** Repositories for brand assets, visual templates, production schedules, and camera/gear inventory tracking.
* **Whiteboard Studio:** Interactive visual canvases for brainstorming and wireframing connected to specific project briefs.

### C. Enterprise Governance & Communications
* **Role-Based Access Control (RBAC):** Granular security model supporting 9 built-in operational roles (Admin, Team Leader, R&D, Writer, Designer, Media Manager, Frontend, Backend, Fullstack) alongside customizable department templates and permission scopes.
* **Integrated Communications:** Omnichannel messaging with direct team chat, client-staff discussion threads, team inboxes, and priority announcement broadcasts.
* **Gamification & Performance Tracking:** Automated merit tracking awarding XP, badges, and real-time leaderboards (Monthly & All-Time Top Performers) that incentivize productivity and quality.

## 4. Technology Stack & Database Design
* **Backend Runtime:** Node.js with Express framework, utilizing compression, rate limiting, and structured JSON logging for high performance.
* **Database Engine:** Embedded `better-sqlite3` offering sub-millisecond querying, ACID transaction safety, foreign-key cascade enforcement, optimized indexes for high-frequency queries, and automated schema migrations.
* **Frontend Architecture:** Lightweight, dependency-minimal Vanilla JavaScript, semantic HTML5, and responsive CSS3. The interface features a dark futuristic aesthetic with glassmorphism, dynamic glow accents, and responsive typography (Rajdhani, Orbitron, Inter).
* **AI & External Integrations:** OpenAI API integration (`gpt-4-turbo-preview`) powering the Nexus AI engine, Nodemailer for automated email notifications, and Multer for chunked file streaming.

## 5. Security & Deployment Operations
The application is engineered with security and deployment simplicity in mind:
* **Authentication & Authorization:** Hardened JWT session management, Bcrypt password hashing, OTP-based reset flows, and staff-governed client credential provisioning (`TT-CLI-XXXXX`).
* **DevOps & Resilience:** Turnkey execution scripts (`start.bat`, `start.sh`, `stop.bat`) paired with concurrent port orchestrators (`cross-env`, `concurrently`). The system includes production-ready Nginx reverse proxy configs, PM2 daemon scripts, and an automated background "Deadline Pulse" monitor for overdue deliverables.

## 6. Conclusion
Tech Turf CRM bridges the gap between internal agency operations and transparent client communication. By combining automated quality evaluations, deep operational tracking, and a sleek dual-portal architecture, it provides digital agencies with a scalable, self-hosted operational backbone designed to enhance output velocity and client retention.
