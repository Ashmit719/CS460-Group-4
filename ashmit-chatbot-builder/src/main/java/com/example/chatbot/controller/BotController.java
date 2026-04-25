package com.example.chatbot.controller;

import com.example.chatbot.model.Bot;
import com.example.chatbot.model.User;
import com.example.chatbot.repository.UserRepository;
import com.example.chatbot.service.BotService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/bot")
@CrossOrigin(origins = "*")
public class BotController {

    private final BotService botService;
    private final UserRepository userRepository;

    public BotController(BotService botService, UserRepository userRepository) {
        this.botService = botService;
        this.userRepository = userRepository;
    }

    @PostMapping("/create")
    public Bot createBot(@RequestBody Map<String, String> payload) {
        Long userId = Long.parseLong(payload.get("userId"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        Bot bot = new Bot();
        bot.setName(payload.get("name"));
        bot.setUrl(payload.get("url"));
        bot.setDescription(payload.getOrDefault("description", ""));
        bot.setLanguage(payload.getOrDefault("language", "English"));
        bot.setPersonality(payload.getOrDefault("personality", "Professional"));
        bot.setTone(payload.getOrDefault("tone", "Balanced"));
        bot.setResponseLength(payload.getOrDefault("responseLength", "Medium"));
        bot.setSourceType(payload.getOrDefault("sourceType", "website"));
        bot.setPublished(false);
        bot.setUser(user);

        String knowledgeText = payload.getOrDefault("knowledgeText", "");

        return botService.createBot(bot, knowledgeText);
    }

    @PutMapping("/update/{botId}")
    public Bot updateBot(@PathVariable Long botId, @RequestBody Map<String, String> payload) {
        Long userId = Long.parseLong(payload.get("userId"));

        Bot existingBot = botService.getBot(botId);
        if (existingBot == null) {
            throw new RuntimeException("Bot not found");
        }

        if (existingBot.getUser() == null ||
                !existingBot.getUser().getId().equals(userId)) {
            throw new RuntimeException("Bot does not belong to this user");
        }

        existingBot.setName(payload.getOrDefault("name", existingBot.getName()));
        existingBot.setUrl(payload.getOrDefault("url", existingBot.getUrl()));
        existingBot.setDescription(payload.getOrDefault("description", existingBot.getDescription()));
        existingBot.setLanguage(payload.getOrDefault("language", existingBot.getLanguage()));
        existingBot.setPersonality(payload.getOrDefault("personality", existingBot.getPersonality()));
        existingBot.setTone(payload.getOrDefault("tone", existingBot.getTone()));
        existingBot.setResponseLength(payload.getOrDefault("responseLength", existingBot.getResponseLength()));
        existingBot.setSourceType(payload.getOrDefault("sourceType", existingBot.getSourceType()));

        return botService.updateBot(existingBot, payload.getOrDefault("knowledgeText", ""));
    }

    @GetMapping("/user/{userId}")
    public List<Bot> getBotsByUser(@PathVariable Long userId) {
        return botService.getBotsByUser(userId);
    }

    @GetMapping("/{botId}")
    public Bot getBot(@PathVariable Long botId) {
        Bot bot = botService.getBot(botId);

        if (bot == null) {
            throw new RuntimeException("Bot not found");
        }

        return bot;
    }

    @PostMapping("/publish/{botId}")
    public Bot publishBot(@PathVariable Long botId, @RequestParam Long userId) {
        Bot bot = botService.getBot(botId);

        if (bot == null) {
            throw new RuntimeException("Bot not found");
        }

        if (bot.getUser() == null ||
                !bot.getUser().getId().equals(userId)) {
            throw new RuntimeException("Unauthorized");
        }

        if (bot.getPublicToken() == null || bot.getPublicToken().isBlank()) {
            bot.setPublicToken(UUID.randomUUID().toString());
        }

        bot.setPublished(true);

        return botService.save(bot);
    }

    @GetMapping("/public/{token}")
    public Bot getPublicBot(@PathVariable String token) {
        Bot bot = botService.getBotByPublicToken(token);

        if (bot == null || !Boolean.TRUE.equals(bot.getPublished())) {
            throw new RuntimeException("Bot not available");
        }

        return bot;
    }

    @PostMapping("/publicChat")
    public String publicChat(@RequestBody Map<String, String> payload) {
        String message = payload.get("message");
        String token = payload.get("token");
        String sessionId = payload.get("sessionId"); // NEW

        Bot bot = botService.getBotByPublicToken(token);

        if (bot == null || !Boolean.TRUE.equals(bot.getPublished())) {
            throw new RuntimeException("Bot not available");
        }

        return botService.generateAndTrackPublicResponse(bot, sessionId, message);
    }

  
    @PostMapping("/chat")
    public String chat(@RequestBody Map<String, String> payload) {
        String message = payload.get("message");
        Long userId = Long.parseLong(payload.get("userId"));
        Long botId = Long.parseLong(payload.get("botId"));

        Bot bot = botService.getBot(botId);

        if (bot == null) {
            throw new RuntimeException("Bot not found");
        }

        if (bot.getUser() == null ||
                !bot.getUser().getId().equals(userId)) {
            throw new RuntimeException("Bot does not belong to this user");
        }

        return botService.generateAndTrackPrivateResponse(bot, message);
    }
    
    @PostMapping("/previewChat")
    public String previewChat(@RequestBody Map<String, String> payload) {
        String message = payload.get("message");
        String knowledgeText = payload.getOrDefault("knowledgeText", "");
        String url = payload.getOrDefault("url", "");

        Bot previewBot = new Bot();
        previewBot.setUrl(url);
        previewBot.setDescription(payload.getOrDefault("description", ""));
        previewBot.setPersonality(payload.getOrDefault("personality", "Professional"));
        previewBot.setLanguage(payload.getOrDefault("language", "English"));
        previewBot.setTone(payload.getOrDefault("tone", "Balanced"));
        previewBot.setResponseLength(payload.getOrDefault("responseLength", "Medium"));
        previewBot.setSourceType(payload.getOrDefault("sourceType", "website"));

        return botService.generateResponse(message, knowledgeText, previewBot);
    }
}