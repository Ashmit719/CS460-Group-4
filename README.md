# 🤖 CS460 – Chatbot Builder Projects  
**Student:** Ashmit Nirwan  
University of Hartford  

---

## 📌 Overview

This repository contains two chatbot systems developed as part of CS460. Together, these projects demonstrate both:

- **Real-world AI chatbot development (production-style system)**
- **Core chatbot learning concepts (educational system)**

The project initially started with the idea of building a chatbot using the OpenAI API to create a more intelligent and commercially viable system. As development progressed, the team pivoted toward creating a simplified, educational chatbot builder that demonstrates how chatbots work internally without relying on external AI services.

While contributing to the team project, I continued developing my original AI-powered chatbot independently to fully explore its real-world implementation and deployment.

---

## 📂 Repository Structure
CS460-Group-4/
├── ashmit-chatbot-builder/ # Individual Project (AI-powered chatbot platform)

├── byte-squad-chatbot-builder/ # Team Project (in-browser chatbot learning system)

---

# 👤 Project 1: Ashmit Chatbot Builder (AI-Powered Platform)

## 📌 Description

The Chatbot Builder App is a full-stack web application that allows users to create, customize, test, and deploy AI-powered chatbots without requiring advanced programming knowledge.

It provides a guided workflow where users can:
- Create chatbots  
- Add knowledge sources (URL or text)  
- Customize chatbot behavior  
- Test responses  
- Deploy bots via public links  

This project represents a **production-style chatbot system**.

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
- Shareable chatbot interface  

### 🔹 Analytics Dashboard
- Total conversations  
- Active bots  
- Message statistics  
- Recent activity tracking  

---

## 🧠 System Architecture
User → Frontend → Backend → Database → OpenAI API

### Components
- Frontend: HTML, CSS, JavaScript  
- Backend: Spring Boot (Java)  
- Database: PostgreSQL  
- AI Integration: OpenAI API  

---

## 🎯 Purpose

This project focuses on:
- Building a **commercial-style chatbot platform**  
- Supporting real-world deployment  
- Enabling intelligent AI-driven responses  
- Demonstrating scalable system design  

---

# 👥 Project 2: Byte Squad Chatbot Builder (Educational System)

## 📌 Description

The Byte Squad Chatbot Builder is a lightweight, browser-based chatbot system designed to explain how chatbots work internally without relying on external AI APIs.

It allows users to:
- Paste their own dataset  
- Train a small chatbot model  
- Generate responses based on learned patterns  

---

## 💡 Core Idea

Think of this system as:

- Dataset = learning material  
- Model = student  
- Training = studying patterns  
- Generation = predicting the next word  

In simple terms:

> This app lets you paste your own text, train a small chatbot brain on it, and chat with that trained model directly in your browser.

---

## 🔄 How It Works
User inputs text
→ Text is cleaned and tokenized
→ Model learns patterns from tokens
→ User enters a prompt
→ Model predicts next tokens repeatedly
→ Chatbot generates output

---

## ⚙️ Key Features

- Fully client-side chatbot (runs in browser)  
- No external AI APIs required  
- Custom dataset training  
- Tokenization using BPE (Byte Pair Encoding)  
- Real-time training and visualization  
- Adjustable parameters (temperature, top-k, etc.)  
- Model export/import support  

---

## 🎯 Purpose

This project is designed as an **educational tool** to:

- Help users understand how chatbots work internally  
- Demonstrate tokenization and training  
- Show how AI generates text step-by-step  
- Provide hands-on experience with chatbot learning  

---

# ⚖️ Key Differences

| Aspect | Ashmit Chatbot Builder | Byte Squad Chatbot Builder |
|------|------------------------|----------------------------|
| Type | Production System | Educational System |
| AI | OpenAI API | No external AI |
| Backend | Spring Boot | Client-side |
| Use Case | Real-world chatbot | Learning tool |
| Complexity | High | Moderate |

---

# 🛠️ Technologies Used

## Frontend
- HTML5  
- CSS3  
- JavaScript  
- Chart.js  

## Backend
- Java 21  
- Spring Boot 3  

## Database
- PostgreSQL  
- JPA / Hibernate  

## AI Integration
- OpenAI API  

## Tools
- Eclipse IDE  
- Git & GitHub  
- Postman  
- pgAdmin  

---

# 🔀 Git Workflow

The project follows a 3-branch workflow:

- `develop` → active development  
- `test` → testing & validation  
- `main` → production-ready code  

### Promotion Flow:
develop → test → main

---

# ▶️ Running the Projects

## 🔹 Ashmit Chatbot Builder

### Option 1 (Recommended)
Run: start-botbuilder.bat

### Option 2 (Eclipse)
Run:ChatbotBuilderApplication.java

Access:http://localhost:8080/

---

## 🔹 Byte Squad Chatbot Builder

Run:start-server.bat

OR:npx http-server -p 8000

Then open:http://localhost:8000/chatbot.html

---

# ⚠️ Prerequisites

- Java 21+  
- PostgreSQL running  
- OpenAI API Key  

Set environment variable:
OPENAI_API_KEY=your_key_here

---

# 🧪 Testing

- Functional testing completed  
- Chatbot response validation  
- API testing using Postman  
- Analytics verification  

---

# 🚧 Future Improvements

- PDF ingestion support  
- Improved chatbot accuracy  
- Multi-language support  
- Advanced analytics dashboard  
- Enhanced role-based access control  

---

# 🎯 Final Summary

This repository demonstrates:

- Full-stack development  
- AI integration  
- Core machine learning concepts  
- System design and architecture  
- Team collaboration  

By building both systems, I explored:
- How chatbots are built  
- How chatbots work internally  

---

# 👨‍💻 Author

Ashmit Nirwan  
University of Hartford  
