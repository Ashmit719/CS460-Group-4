package com.example.chatbot.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;

@Entity
@Table(name = "bot_chunk")
public class BotChunk {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "chunk_text", columnDefinition = "TEXT", nullable = false)
    private String chunkText;

    @Column(name = "embedding_json", columnDefinition = "TEXT", nullable = false)
    private String embeddingJson;

    @Column(name = "chunk_index")
    private Integer chunkIndex;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bot_id", nullable = false)
    @JsonBackReference
    private Bot bot;

    public BotChunk() {
    }

    public BotChunk(String chunkText, String embeddingJson, Integer chunkIndex, Bot bot) {
        this.chunkText = chunkText;
        this.embeddingJson = embeddingJson;
        this.chunkIndex = chunkIndex;
        this.bot = bot;
    }

    public Long getId() {
        return id;
    }

    public String getChunkText() {
        return chunkText;
    }

    public String getEmbeddingJson() {
        return embeddingJson;
    }

    public Integer getChunkIndex() {
        return chunkIndex;
    }

    public Bot getBot() {
        return bot;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public void setChunkText(String chunkText) {
        this.chunkText = chunkText;
    }

    public void setEmbeddingJson(String embeddingJson) {
        this.embeddingJson = embeddingJson;
    }

    public void setChunkIndex(Integer chunkIndex) {
        this.chunkIndex = chunkIndex;
    }

    public void setBot(Bot bot) {
        this.bot = bot;
    }
}