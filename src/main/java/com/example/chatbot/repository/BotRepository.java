package com.example.chatbot.repository;

import com.example.chatbot.model.Bot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BotRepository extends JpaRepository<Bot, Long> {
    List<Bot> findByUserId(Long userId);
}