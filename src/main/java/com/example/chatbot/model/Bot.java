package com.example.chatbot.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;

@Entity
@Table(name = "bot")
public class Bot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(length = 2000)
    private String url;

    @Column(length = 5000)
    private String description;

    private String language;

    private String personality;

    private String tone;

    @Column(name = "response_length")
    private String responseLength;

    @Column(name = "source_type")
    private String sourceType;

    private String status;

    @ManyToOne
    @JoinColumn(name = "user_id")
    @JsonBackReference
    private User user;

    public Bot() {}

    public Bot(
            String name,
            String url,
            String description,
            String language,
            String personality,
            String tone,
            String responseLength,
            String sourceType,
            String status,
            User user
    ) {
        this.name = name;
        this.url = url;
        this.description = description;
        this.language = language;
        this.personality = personality;
        this.tone = tone;
        this.responseLength = responseLength;
        this.sourceType = sourceType;
        this.status = status;
        this.user = user;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getUrl() {
        return url;
    }

    public String getDescription() {
        return description;
    }

    public String getLanguage() {
        return language;
    }

    public String getPersonality() {
        return personality;
    }

    public String getTone() {
        return tone;
    }

    public String getResponseLength() {
        return responseLength;
    }

    public String getSourceType() {
        return sourceType;
    }

    public String getStatus() {
        return status;
    }

    public User getUser() {
        return user;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public void setPersonality(String personality) {
        this.personality = personality;
    }

    public void setTone(String tone) {
        this.tone = tone;
    }

    public void setResponseLength(String responseLength) {
        this.responseLength = responseLength;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public void setUser(User user) {
        this.user = user;
    }
}