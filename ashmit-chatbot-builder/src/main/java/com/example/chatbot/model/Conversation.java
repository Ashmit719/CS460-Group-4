package com.example.chatbot.model;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "conversation")
public class Conversation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "bot_id")
    private Bot bot;

    @Column(name = "session_id", length = 120)
    private String sessionId;

    @Column(name = "public_chat", nullable = false)
    private Boolean publicChat = false;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt = LocalDateTime.now();

    @Column(name = "last_message_at", nullable = false)
    private LocalDateTime lastMessageAt = LocalDateTime.now();

    @OneToMany(mappedBy = "conversation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC")
    private List<Message> messages = new ArrayList<>();

    public Conversation() {
    }

    public Long getId() {
        return id;
    }

    public Bot getBot() {
        return bot;
    }

    public String getSessionId() {
        return sessionId;
    }

    public Boolean getPublicChat() {
        return publicChat;
    }

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public LocalDateTime getLastMessageAt() {
        return lastMessageAt;
    }

    public List<Message> getMessages() {
        return messages;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public void setBot(Bot bot) {
        this.bot = bot;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public void setPublicChat(Boolean publicChat) {
        this.publicChat = publicChat;
    }

    public void setStartedAt(LocalDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public void setLastMessageAt(LocalDateTime lastMessageAt) {
        this.lastMessageAt = lastMessageAt;
    }

    public void setMessages(List<Message> messages) {
        this.messages = messages;
    }
}