package com.example.chatbot.repository;

import com.example.chatbot.model.BotChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BotChunkRepository extends JpaRepository<BotChunk, Long> {

    List<BotChunk> findByBotIdOrderByChunkIndexAsc(Long botId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from BotChunk bc where bc.bot.id = :botId")
    void deleteByBotId(@Param("botId") Long botId);
}