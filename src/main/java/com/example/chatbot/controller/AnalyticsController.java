package com.example.chatbot.controller;

import com.example.chatbot.model.Bot;
import com.example.chatbot.model.Conversation;
import com.example.chatbot.model.Message;
import com.example.chatbot.repository.BotRepository;
import com.example.chatbot.repository.ConversationRepository;
import com.example.chatbot.repository.MessageRepository;
import com.example.chatbot.repository.UserRepository;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/analytics")
@CrossOrigin(origins = "*")
public class AnalyticsController {

    private final UserRepository userRepository;
    private final BotRepository botRepository;
    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;

    public AnalyticsController(
            UserRepository userRepository,
            BotRepository botRepository,
            ConversationRepository conversationRepository,
            MessageRepository messageRepository
    ) {
        this.userRepository = userRepository;
        this.botRepository = botRepository;
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
    }

    @GetMapping("/user/{userId}")
    public Map<String, Object> getUserAnalytics(@PathVariable Long userId) {
        List<Bot> bots = botRepository.findByUserId(userId);
        List<Long> botIds = bots.stream().map(Bot::getId).toList();

        long totalBots = bots.size();
        long activeBots = bots.stream()
                .filter(bot -> Boolean.TRUE.equals(bot.getPublished()))
                .count();

        List<Conversation> conversations = new ArrayList<>();
        List<Message> messages = new ArrayList<>();

        for (Long botId : botIds) {
            List<Conversation> botConversations = conversationRepository.findByBotId(botId);
            conversations.addAll(botConversations);

            for (Conversation conversation : botConversations) {
                messages.addAll(
                        messageRepository.findByConversationIdOrderByCreatedAtAsc(conversation.getId())
                );
            }
        }

        long totalConversations = conversations.size();
        long totalMessages = messages.size();
        double avgMessagesPerConversation = totalConversations == 0
                ? 0.0
                : (double) totalMessages / totalConversations;

        List<Map<String, Object>> recentActivity = conversations.stream()
                .sorted(Comparator.comparing(Conversation::getLastMessageAt).reversed())
                .limit(10)
                .map(conversation -> {
                    Map<String, Object> item = new HashMap<>();
                    item.put("conversationId", conversation.getId());
                    item.put("botId", conversation.getBot().getId());
                    item.put("botName", conversation.getBot().getName());
                    item.put("sessionId", conversation.getSessionId());
                    item.put("publicChat", conversation.getPublicChat());
                    item.put("startedAt", conversation.getStartedAt());
                    item.put("lastMessageAt", conversation.getLastMessageAt());
                    return item;
                })
                .collect(Collectors.toList());

        Map<String, Object> response = new HashMap<>();
        response.put("totalBots", totalBots);
        response.put("activeBots", activeBots);
        response.put("totalConversations", totalConversations);
        response.put("totalMessages", totalMessages);
        response.put("avgMessagesPerConversation", avgMessagesPerConversation);
        response.put("recentActivity", recentActivity);

        return response;
    }

    @GetMapping("/admin")
    public Map<String, Object> getAdminAnalytics() {
        List<Bot> bots = botRepository.findAll();
        List<Conversation> conversations = conversationRepository.findAll();
        List<Message> messages = messageRepository.findAll();

        long totalUsers = userRepository.count();
        long totalBots = bots.size();
        long totalConversations = conversations.size();
        long totalMessages = messages.size();
        long activeBots = bots.stream()
                .filter(bot -> Boolean.TRUE.equals(bot.getPublished()))
                .count();

        List<Map<String, Object>> recentActivity = conversations.stream()
                .sorted(Comparator.comparing(Conversation::getLastMessageAt).reversed())
                .limit(15)
                .map(conversation -> {
                    Map<String, Object> item = new HashMap<>();
                    item.put("conversationId", conversation.getId());
                    item.put("botId", conversation.getBot().getId());
                    item.put("botName", conversation.getBot().getName());
                    item.put("sessionId", conversation.getSessionId());
                    item.put("publicChat", conversation.getPublicChat());
                    item.put("startedAt", conversation.getStartedAt());
                    item.put("lastMessageAt", conversation.getLastMessageAt());
                    return item;
                })
                .collect(Collectors.toList());

        Map<String, Object> response = new HashMap<>();
        response.put("totalUsers", totalUsers);
        response.put("totalBots", totalBots);
        response.put("activeBots", activeBots);
        response.put("totalConversations", totalConversations);
        response.put("totalMessages", totalMessages);
        response.put("recentActivity", recentActivity);

        return response;
    }
}