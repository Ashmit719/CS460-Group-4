# 🤖 Chatbot Builder App

## 📌 Project Overview
The Chatbot Builder App is a full-stack web application that allows users to create, customize, test, and deploy AI-powered chatbots without requiring advanced programming knowledge.

The platform provides a guided, step-by-step workflow where users can:
- Create chatbots
- Add knowledge sources (URL or text)
- Customize chatbot behavior
- Test responses
- Deploy bots via public links

This project was developed as part of a Software Engineering course and demonstrates end-to-end system design, development, and deployment.

---

## 🚀 Key Features

### 🔹 User Dashboard
- View and manage all created chatbots
- Quick access to edit, test, and deploy bots

### 🔹 Chatbot Creation Wizard
- Step-by-step bot creation flow
- Supports multiple configurations

### 🔹 Knowledge Source Integration
- Website URL scraping
- Manual text input
- (Future scope: PDF ingestion)

### 🔹 Chatbot Customization
- Personality (Friendly, Professional, Support)
- Tone (Formal / Casual / Balanced)
- Response Length (Short / Medium / Detailed)

### 🔹 Chatbot Testing
- Built-in chat interface
- Preview responses before deployment

### 🔹 Deployment
- Public chatbot link using unique token
- Shareable chatbot interface for external users

### 🔹 Analytics Dashboard
- Total conversations
- Active bots
- Message statistics
- Recent activity tracking

---

## 🎯 Project Goals

- Provide a no-code chatbot builder
- Enable quick deployment of AI assistants
- Allow custom knowledge ingestion
- Deliver real-time chatbot responses
- Provide analytics for performance tracking

---

## 👥 System Actors

### 🧑 User
- Creates and manages chatbots
- Adds knowledge sources
- Tests chatbot responses
- Deploys bots
- Views analytics

### 🛠️ Admin
- Manages platform users
- Monitors system activity
- Controls admin-level operations

### 🌐 Public User (Visitor)
- Interacts with deployed chatbots via public link

---

## 🔄 System Workflow

1. User logs into the platform  
2. User accesses dashboard  
3. User creates a chatbot  
4. User adds knowledge (URL / text)  
5. System ingests and chunks data  
6. User customizes chatbot behavior  
7. User tests chatbot responses  
8. User publishes chatbot  
9. Public users interact via shareable link  
10. Analytics track usage  

---

## 🧠 System Architecture

### Logical Flow
User → Frontend → Backend → Database → OpenAI API

### Components
- Frontend (HTML/CSS/JavaScript)
- Backend (Spring Boot)
- Database (PostgreSQL)
- AI Integration (OpenAI API)

---

## 🛠️ Technologies Used

### Frontend
- HTML5
- CSS3
- JavaScript (Vanilla JS)
- Chart.js (Analytics)

### Backend
- Java 21
- Spring Boot 3
- REST APIs

### Database
- PostgreSQL
- JPA / Hibernate

### AI Integration
- OpenAI API (GPT model)

### Tools
- Eclipse IDE
- Git & GitHub
- Postman
- pgAdmin

---

## 🧩 Database Structure

Main tables:
- users
- bot
- bot_chunk
- conversation
- message

---

## 🔀 Git Workflow

The project follows a 3-branch workflow:

- develop → active development  
- test → testing & validation  
- main → production-ready code  

### Promotion Flow:
develop → test → main

---

## ⚙️ Environment Profiles

The application supports multiple environments:

- dev
- test
- prod

Configured using:
- application-dev.properties
- application-test.properties
- application-prod.properties

---

## ▶️ Running the Application (Demo)

### Option 1 — Using Batch File (Recommended)

Run:
start-botbuilder.bat

✔ Starts application in PROD mode  
✔ Automatically opens browser  

---

### Option 2 — Using Eclipse

Run:
ChatbotBuilderApplication.java

---

## 🌍 Access Application

http://localhost:8080/

---

## ⚠️ Prerequisites

- Java 21+
- PostgreSQL running
- OpenAI API Key

Set API key:
OPENAI_API_KEY=your_key_here

---

## 🧪 Testing

- Functional testing performed
- Chatbot response validation
- API testing using Postman
- Analytics verification

---

## 🚧 Pending Improvements

- PDF ingestion support
- Chat Interface on the Landing Page
- Improved response accuracy
- Multi-language chatbot support
- Advanced analytics dashboard
- Role-based access control enhancements

---

## 🎓 Course Context

This project was developed as part of a Software Engineering course to demonstrate:
- Full-stack development
- System design and architecture
- Agile workflow (Git branches)
- Testing and deployment strategies

---

## 👨‍💻 Author

Team:  
- Ashmit Nirwan

University of Hartford