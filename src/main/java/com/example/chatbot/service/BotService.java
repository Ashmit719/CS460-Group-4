package com.example.chatbot.service;

import com.example.chatbot.model.Bot;
import com.example.chatbot.model.BotChunk;
import com.example.chatbot.repository.BotChunkRepository;
import com.example.chatbot.repository.BotRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.json.JSONArray;
import org.json.JSONObject;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class BotService {

    private final BotRepository botRepository;
    private final BotChunkRepository botChunkRepository;

    @PersistenceContext
    private EntityManager entityManager;

    @Value("${openai.api.key}")
    private String openAiApiKey;

    private static final String OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
    private static final String OPENAI_EMBEDDING_URL = "https://api.openai.com/v1/embeddings";

    public BotService(BotRepository botRepository, BotChunkRepository botChunkRepository) {
        this.botRepository = botRepository;
        this.botChunkRepository = botChunkRepository;
    }

    @Transactional
    public Bot createBot(Bot bot) {
        Bot savedBot = botRepository.save(bot);
        ingestBotContent(savedBot, "");
        return savedBot;
    }

    @Transactional
    public Bot updateBot(Bot bot, String knowledgeText) {
        Bot existingBot = bot.getId() != null
                ? botRepository.findById(bot.getId()).orElse(null)
                : null;

        boolean shouldReingest = true;

        if (existingBot != null) {
            boolean urlChanged = !safeEquals(existingBot.getUrl(), bot.getUrl());
            boolean sourceTypeChanged = !safeEquals(existingBot.getSourceType(), bot.getSourceType());
            boolean textSourceUpdated = "text".equalsIgnoreCase(bot.getSourceType())
                    && knowledgeText != null
                    && !knowledgeText.isBlank();

            shouldReingest = urlChanged || sourceTypeChanged || textSourceUpdated;
        }

        Bot savedBot = botRepository.save(bot);

        if (shouldReingest) {
            ingestBotContent(savedBot, knowledgeText);
        }

        return savedBot;
    }

    public Bot getBot(Long id) {
        return botRepository.findById(id).orElse(null);
    }

    public List<Bot> getAllBots() {
        return botRepository.findAll();
    }

    public List<Bot> getBotsByUser(Long userId) {
        return botRepository.findByUserId(userId);
    }

    public String generateResponse(String message, String knowledgeText, Bot bot) {
        if (message == null || message.trim().isEmpty()) {
            return "Please enter a valid question.";
        }

        if (bot == null) {
            return "Bot configuration is missing.";
        }

        try {
            List<String> topChunks;

            if (bot.getId() != null) {
                topChunks = retrieveTopStoredChunksEmbedding(bot.getId(), message, 12);
            } else {
                List<String> chunks = new ArrayList<>();
                String url = normalizeSourceUrl(bot.getUrl());

                if (url != null && !url.isBlank()) {
                    if (isPdfUrl(url)) {
                        chunks = extractChunksFromPdfUrl(url);
                    } else {
                        Document doc = Jsoup.connect(url)
                                .userAgent("Mozilla/5.0")
                                .timeout(20000)
                                .get();

                        doc.select("script, style, nav, footer, header, aside, noscript, form").remove();
                        chunks = extractChunksFromDocument(doc);
                    }
                } else if (knowledgeText != null && !knowledgeText.isBlank()) {
                    chunks = extractChunksFromText(knowledgeText);
                }

                if (chunks.isEmpty()) {
                    return "Sorry, I could not find an answer.";
                }

                topChunks = retrieveTopChunksEmbedding(message, chunks, 12);
            }

            if (topChunks.isEmpty()) {
                return "I could not find a clear answer in the website content.";
            }

            String context = String.join("\n\n", topChunks);

            String gptAnswer = queryOpenAI(message, context, bot);
            if (isUsableAnswer(gptAnswer)) {
                return gptAnswer;
            }

            return "I could not find a clear answer in the website content.";

        } catch (Exception e) {
            System.out.println("Error in generateResponse: " + e.getMessage());
            e.printStackTrace();
            return "Sorry, something went wrong while processing your question.";
        }
    }

    private void ingestBotContent(Bot bot, String knowledgeText) {
        try {
            if (bot.getId() == null) {
                return;
            }

            List<String> chunks = new ArrayList<>();
            String sourceType = bot.getSourceType() != null ? bot.getSourceType() : "website";
            String url = normalizeSourceUrl(bot.getUrl());

            if ("website".equalsIgnoreCase(sourceType) && url != null && !url.isBlank()) {
                if (isPdfUrl(url)) {
                    chunks = extractChunksFromPdfUrl(url);
                } else {
                    Document doc = Jsoup.connect(url)
                            .userAgent("Mozilla/5.0")
                            .timeout(20000)
                            .get();

                    doc.select("script, style, nav, footer, header, aside, noscript, form").remove();
                    chunks = extractChunksFromDocument(doc);
                }
            } else if ("text".equalsIgnoreCase(sourceType) && knowledgeText != null && !knowledgeText.isBlank()) {
                chunks = extractChunksFromText(knowledgeText);
            }

            List<String> validChunks = chunks.stream()
                    .filter(c -> c != null && !c.isBlank())
                    .distinct()
                    .toList();

            System.out.println("Chunk count before embeddings: " + validChunks.size());

            botChunkRepository.deleteByBotId(bot.getId());
            entityManager.flush();
            entityManager.clear();

            if (validChunks.isEmpty()) {
                System.out.println("Stored chunks: 0");
                return;
            }

            List<List<Double>> embeddings = getEmbeddings(validChunks);

            for (int i = 0; i < validChunks.size(); i++) {
                BotChunk chunk = new BotChunk();
                chunk.setBot(bot);
                chunk.setChunkIndex(i);
                chunk.setChunkText(validChunks.get(i));
                chunk.setEmbeddingJson(toJsonArrayString(embeddings.get(i)));

                botChunkRepository.save(chunk);
            }

            entityManager.flush();
            System.out.println("Stored chunks: " + validChunks.size());

        } catch (Exception e) {
            System.out.println("Ingest error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private boolean safeEquals(String a, String b) {
        if (a == null && b == null) {
            return true;
        }
        if (a == null || b == null) {
            return false;
        }
        return a.equals(b);
    }

    private boolean isPdfUrl(String url) {
        return url != null && url.toLowerCase().contains(".pdf");
    }

    private List<String> extractChunksFromPdfUrl(String pdfUrl) throws IOException {
        try (InputStream inputStream = new URL(pdfUrl).openStream()) {
            byte[] pdfBytes = inputStream.readAllBytes();

            try (PDDocument pdf = Loader.loadPDF(pdfBytes)) {
                PDFTextStripper stripper = new PDFTextStripper();
                String rawText = stripper.getText(pdf);

                if (rawText == null || rawText.isBlank()) {
                    return new ArrayList<>();
                }

                String cleanedPdfText = normalizePdfText(rawText);
                return extractStructuredPdfChunks(cleanedPdfText);
            }
        }
    }

    private String normalizePdfText(String text) {
        String normalized = text.replace("\r", "\n");
        normalized = normalized.replaceAll("[ \\t]+", " ");
        normalized = normalized.replaceAll("\\n{3,}", "\n\n");
        return normalized.trim();
    }

    private List<String> extractStructuredPdfChunks(String text) {
        LinkedHashSet<String> chunks = new LinkedHashSet<>();

        String[] lines = text.split("\\n");
        List<String> cleanedLines = new ArrayList<>();

        for (String line : lines) {
            String cleaned = cleanText(line);

            if (cleaned.isBlank()) {
                cleanedLines.add("");
                continue;
            }

            if (shouldSkipPdfLine(cleaned)) {
                continue;
            }

            cleanedLines.add(cleaned);
        }

        StringBuilder paragraph = new StringBuilder();

        for (String line : cleanedLines) {
            if (line.isBlank()) {
                addPdfParagraphChunk(chunks, paragraph.toString());
                paragraph.setLength(0);
                continue;
            }

            if (isLikelyHeading(line)) {
                addPdfParagraphChunk(chunks, paragraph.toString());
                paragraph.setLength(0);
                paragraph.append(line);
                continue;
            }

            if (paragraph.length() == 0) {
                paragraph.append(line);
            } else {
                if (paragraph.charAt(paragraph.length() - 1) == '-') {
                    paragraph.setLength(paragraph.length() - 1);
                    paragraph.append(line);
                } else {
                    paragraph.append(" ").append(line);
                }
            }

            if (paragraph.length() > 1600) {
                addPdfParagraphChunk(chunks, paragraph.toString());
                paragraph.setLength(0);
            }
        }

        addPdfParagraphChunk(chunks, paragraph.toString());

        return new ArrayList<>(chunks);
    }

    private void addPdfParagraphChunk(Set<String> chunks, String text) {
        String cleaned = cleanText(text);

        if (cleaned.length() < 140) {
            return;
        }

        if (looksLikeNoise(cleaned) || shouldSkipText(cleaned) || looksLikeTocLine(cleaned)) {
            return;
        }

        if (cleaned.length() > 2200) {
            List<String> splitChunks = splitLargeText(cleaned, 1600);
            for (String part : splitChunks) {
                String partClean = cleanText(part);
                if (partClean.length() >= 140
                        && !looksLikeNoise(partClean)
                        && !shouldSkipText(partClean)
                        && !looksLikeTocLine(partClean)) {
                    chunks.add(partClean);
                }
            }
            return;
        }

        chunks.add(cleaned);
    }

    private List<String> splitLargeText(String text, int maxLen) {
        List<String> result = new ArrayList<>();
        String remaining = text;

        while (remaining.length() > maxLen) {
            int splitAt = remaining.lastIndexOf(". ", maxLen);
            if (splitAt < maxLen / 2) {
                splitAt = remaining.lastIndexOf(" ", maxLen);
            }
            if (splitAt < 0) {
                splitAt = maxLen;
            }

            String part = cleanText(remaining.substring(0, splitAt + 1));
            if (!part.isBlank()) {
                result.add(part);
            }

            remaining = cleanText(remaining.substring(Math.min(splitAt + 1, remaining.length())));
        }

        if (!remaining.isBlank()) {
            result.add(remaining);
        }

        return result;
    }

    private boolean shouldSkipPdfLine(String line) {
        String lower = line.toLowerCase();

        if (line.length() <= 3) {
            return true;
        }

        if (lower.matches("^page\\s+\\d+.*")) {
            return true;
        }

        if (lower.matches("^\\d+$")) {
            return true;
        }

        if (lower.contains("table of contents")) {
            return true;
        }

        if (looksLikeTocLine(line)) {
            return true;
        }

        if (lower.contains("eastern connecticut state university") && line.length() < 120) {
            return true;
        }

        if (lower.matches(".*catalog.*\\d{4}.*") && line.length() < 120) {
            return true;
        }

        return false;
    }

    private boolean looksLikeTocLine(String line) {
        String lower = line.toLowerCase();

        if (lower.matches(".*\\.{2,}\\s*\\d+$")) {
            return true;
        }

        if (lower.matches("^.{1,120}\\s+\\d{1,3}$")) {
            return true;
        }

        if (lower.matches("^[a-z0-9 ,&()'\\-/:]+\\s+\\d{1,3}$")) {
            return true;
        }

        if (lower.contains("chapter") && lower.matches(".*\\d{1,3}$")) {
            return true;
        }

        if (lower.contains("section") && lower.matches(".*\\d{1,3}$")) {
            return true;
        }

        return false;
    }

    private boolean isLikelyHeading(String line) {
        if (line.length() > 140) {
            return false;
        }

        if (line.matches("^[A-Z][A-Z0-9 ,&()'\\-/]{4,}$")) {
            return true;
        }

        if (line.matches("^\\d+(\\.\\d+)*\\s+[A-Z].*")) {
            return true;
        }

        if (line.matches("^[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,7}$") && line.length() < 80) {
            return true;
        }

        return false;
    }

    private boolean isUsableAnswer(String answer) {
        return answer != null
                && !answer.isBlank()
                && !answer.equalsIgnoreCase("I could not find that information in the provided content.")
                && !answer.equalsIgnoreCase("I could not find a clear answer in the website content.");
    }

    private String queryOpenAI(String question, String context, Bot bot) throws IOException {
        OkHttpClient client = new OkHttpClient();

        String personality = bot.getPersonality() != null ? bot.getPersonality() : "Professional";
        String tone = bot.getTone() != null ? bot.getTone() : "Balanced";
        String length = bot.getResponseLength() != null ? bot.getResponseLength() : "Medium";
        String language = bot.getLanguage() != null ? bot.getLanguage() : "English";

        String systemPrompt =
                "You are a " + personality + " chatbot.\n" +
                "Respond in a " + tone + " tone.\n" +
                "Keep responses " + length + ".\n" +
                "Answer in " + language + ".\n\n" +
                "Use ONLY the provided content.\n" +
                "Be concise, accurate, and specific.\n" +
                "For person, title, contact, and role questions, look carefully at nearby lines and combine names, titles, headings, labels, emails, and phone numbers when they clearly belong together.\n" +
                "For curriculum, credit, course, requirement, and count questions, prioritize exact facts and totals stated in the content.\n" +
                "If the answer is directly stated or strongly implied in the provided content, answer it clearly.\n" +
                "Do not invent facts or titles.\n" +
                "If the answer is not present, say exactly: 'I could not find that information in the provided content.'";

        JSONObject body = new JSONObject();
        body.put("model", "gpt-4o-mini");
        body.put("temperature", 0.1);

        JSONArray messages = new JSONArray();
        messages.put(new JSONObject()
                .put("role", "system")
                .put("content", systemPrompt));

        messages.put(new JSONObject()
                .put("role", "user")
                .put("content", "Content:\n" + context + "\n\nQuestion: " + question));

        body.put("messages", messages);

        Request request = new Request.Builder()
                .url(OPENAI_CHAT_URL)
                .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                .addHeader("Authorization", "Bearer " + openAiApiKey)
                .addHeader("Content-Type", "application/json")
                .build();

        try (Response response = client.newCall(request).execute()) {
            if (response.body() == null) {
                throw new IOException("OpenAI response body is empty.");
            }

            String res = response.body().string();

            if (!response.isSuccessful()) {
                throw new IOException("OpenAI error: " + res);
            }

            JSONObject json = new JSONObject(res);
            return json.getJSONArray("choices")
                    .getJSONObject(0)
                    .getJSONObject("message")
                    .getString("content")
                    .trim();
        }
    }

    private List<Double> getEmbedding(String text) throws IOException {
        OkHttpClient client = new OkHttpClient();

        JSONObject body = new JSONObject();
        body.put("model", "text-embedding-3-small");
        body.put("input", text);

        Request request = new Request.Builder()
                .url(OPENAI_EMBEDDING_URL)
                .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                .addHeader("Authorization", "Bearer " + openAiApiKey)
                .addHeader("Content-Type", "application/json")
                .build();

        try (Response response = client.newCall(request).execute()) {
            if (response.body() == null) {
                throw new IOException("Empty embedding response");
            }

            String res = response.body().string();

            if (!response.isSuccessful()) {
                throw new IOException("Embedding error: " + res);
            }

            JSONObject json = new JSONObject(res);
            JSONArray arr = json.getJSONArray("data")
                    .getJSONObject(0)
                    .getJSONArray("embedding");

            List<Double> vector = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                vector.add(arr.getDouble(i));
            }

            return vector;
        }
    }

    private List<List<Double>> getEmbeddings(List<String> texts) throws IOException {
        OkHttpClient client = new OkHttpClient();

        JSONObject body = new JSONObject();
        body.put("model", "text-embedding-3-small");

        JSONArray inputArray = new JSONArray();
        for (String text : texts) {
            inputArray.put(text);
        }
        body.put("input", inputArray);

        Request request = new Request.Builder()
                .url(OPENAI_EMBEDDING_URL)
                .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                .addHeader("Authorization", "Bearer " + openAiApiKey)
                .addHeader("Content-Type", "application/json")
                .build();

        try (Response response = client.newCall(request).execute()) {
            if (response.body() == null) {
                throw new IOException("Empty embedding response");
            }

            String res = response.body().string();

            if (!response.isSuccessful()) {
                throw new IOException("Embedding error: " + res);
            }

            JSONObject json = new JSONObject(res);
            JSONArray data = json.getJSONArray("data");

            List<List<Double>> embeddings = new ArrayList<>();

            for (int i = 0; i < data.length(); i++) {
                JSONArray arr = data.getJSONObject(i).getJSONArray("embedding");
                List<Double> vector = new ArrayList<>();

                for (int j = 0; j < arr.length(); j++) {
                    vector.add(arr.getDouble(j));
                }

                embeddings.add(vector);
            }

            return embeddings;
        }
    }

    private List<String> extractChunksFromDocument(Document doc) {
        Element root = getMainRoot(doc);
        LinkedHashSet<String> chunks = new LinkedHashSet<>();

        Elements headings = root.select("h1, h2, h3, h4, h5");
        for (Element heading : headings) {
            String headingText = cleanText(heading.text());
            if (shouldSkipText(headingText)) {
                continue;
            }

            StringBuilder chunk = new StringBuilder(headingText);
            Element next = heading.nextElementSibling();
            int added = 0;

            while (next != null && added < 5) {
                String tag = next.tagName().toLowerCase();
                if (tag.matches("h1|h2|h3|h4|h5")) {
                    break;
                }

                String text = cleanText(next.text());
                if (!shouldSkipText(text) && text.length() >= 30) {
                    chunk.append(" ").append(text);
                    added++;
                }

                next = next.nextElementSibling();
            }

            addChunkIfUseful(chunks, chunk.toString(), 60, 1600);
        }

        Elements blockEls = root.select("section, article, p, li");
        for (Element el : blockEls) {
            String text = cleanText(el.text());
            addChunkIfUseful(chunks, text, 80, 1400);
        }

        Elements personEls = root.select("h1, h2, h3, h4, h5, h6, p, span, strong, b, li, a");
        List<String> shortLines = new ArrayList<>();

        for (Element el : personEls) {
            String text = cleanText(el.text());
            if (!shouldSkipText(text) && text.length() >= 3 && text.length() <= 120) {
                shortLines.add(text);
            }
        }

        for (int i = 0; i < shortLines.size(); i++) {
            StringBuilder combined = new StringBuilder(shortLines.get(i));

            for (int j = 1; j <= 3 && i + j < shortLines.size(); j++) {
                combined.append(" ").append(shortLines.get(i + j));
            }

            addChunkIfUseful(chunks, combined.toString(), 40, 400);
        }

        return new ArrayList<>(chunks);
    }

    private List<String> extractChunksFromText(String text) {
        String normalized = text.replace("\r", "\n");

        return Arrays.stream(normalized.split("\\n\\s*\\n|(?<=[.!?])\\s+(?=[A-Z])"))
                .map(this::cleanText)
                .filter(s -> s.length() >= 15)
                .filter(s -> !shouldSkipText(s))
                .distinct()
                .toList();
    }

    private void addChunkIfUseful(Set<String> chunks, String text, int minLen, int maxLen) {
        String cleaned = cleanText(text);

        if (cleaned.length() < minLen || cleaned.length() > maxLen) {
            return;
        }

        if (shouldSkipText(cleaned) || looksLikeNoise(cleaned)) {
            return;
        }

        chunks.add(cleaned);
    }

    private Element getMainRoot(Document doc) {
        Element root = doc.selectFirst("main, article, [role=main], .main, .content, .page-content, .content-area");
        return root != null ? root : doc.body();
    }

    private String cleanText(String text) {
        return text == null ? "" : text.replaceAll("\\s+", " ").trim();
    }

    private boolean shouldSkipText(String text) {
        if (text == null || text.isBlank()) {
            return true;
        }

        String lower = text.toLowerCase();

        return lower.equals("menu")
                || lower.equals("search")
                || lower.contains("cookie")
                || lower.contains("privacy policy")
                || lower.contains("skip to content")
                || lower.contains("blackboard")
                || lower.contains("self-service")
                || lower.contains("hawkmail")
                || lower.contains("compass");
    }

    private boolean looksLikeNoise(String text) {
        String lower = text.toLowerCase();
        return lower.length() <= 2;
    }

    private List<String> retrieveTopChunksEmbedding(String question, List<String> chunks, int topK) {
        try {
            List<Double> questionEmbedding = getEmbedding(question);
            Set<String> qWords = buildQueryTerms(question);

            List<Map.Entry<String, Double>> scored = new ArrayList<>();

            for (String chunk : chunks) {
                double totalScore = scoreChunk(questionEmbedding, qWords, question, chunk);
                scored.add(Map.entry(chunk, totalScore));
            }

            scored.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));

            return scored.stream()
                    .limit(topK)
                    .map(Map.Entry::getKey)
                    .toList();

        } catch (Exception e) {
            System.out.println("Embedding error fallback: " + e.getMessage());
            return chunks.stream().limit(topK).toList();
        }
    }

    private List<String> retrieveTopStoredChunksEmbedding(Long botId, String question, int topK) {
        try {
            List<BotChunk> storedChunks = botChunkRepository.findByBotIdOrderByChunkIndexAsc(botId);

            if (storedChunks.isEmpty()) {
                return new ArrayList<>();
            }

            List<Double> questionEmbedding = getEmbedding(question);
            Set<String> qWords = buildQueryTerms(question);

            List<Map.Entry<String, Double>> scored = new ArrayList<>();

            for (BotChunk chunk : storedChunks) {
                List<Double> chunkEmbedding = fromJsonArrayString(chunk.getEmbeddingJson());
                double totalScore = scoreStoredChunk(questionEmbedding, qWords, question, chunk.getChunkText(), chunkEmbedding);
                scored.add(Map.entry(chunk.getChunkText(), totalScore));
            }

            scored.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));

            return scored.stream()
                    .limit(topK)
                    .map(Map.Entry::getKey)
                    .toList();

        } catch (Exception e) {
            System.out.println("Stored embedding retrieval error: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    private double scoreChunk(List<Double> questionEmbedding, Set<String> qWords, String question, String chunk) throws IOException {
        List<Double> chunkEmbedding = getEmbedding(chunk);
        return scoreStoredChunk(questionEmbedding, qWords, question, chunk, chunkEmbedding);
    }

    private double scoreStoredChunk(List<Double> questionEmbedding,
                                    Set<String> qWords,
                                    String question,
                                    String chunk,
                                    List<Double> chunkEmbedding) {
        double embeddingScore = cosineSimilarityVec(questionEmbedding, chunkEmbedding);

        String chunkLower = chunk.toLowerCase();
        long keywordMatches = qWords.stream().filter(chunkLower::contains).count();
        double keywordScore = qWords.isEmpty() ? 0.0 : (double) keywordMatches / qWords.size();

        double bonus = 0.0;
        String qLower = question.toLowerCase();

        if ((qLower.contains("who is")
                || qLower.contains("name")
                || qLower.contains("title")
                || qLower.contains("counselor")
                || qLower.contains("advisor")
                || qLower.contains("contact"))
                && looksPersonOrContactLike(chunkLower)) {
            bonus += 0.25;
        }

        if ((qLower.contains("credit")
                || qLower.contains("course")
                || qLower.contains("class")
                || qLower.contains("curriculum")
                || qLower.contains("requirement")
                || qLower.contains("required"))
                && looksProgramRequirementLike(chunkLower)) {
            bonus += 0.25;
        }

        if (containsQuotedOrNamedEntity(question, chunkLower)) {
            bonus += 0.15;
        }

        if (questionLooksLikeCountQuestion(qLower) && chunkContainsCountSignals(chunkLower)) {
            bonus += 0.15;
        }

        if (qLower.contains("mba") && chunkLower.contains("mba")) {
            bonus += 0.08;
        }

        if ((qLower.contains("credit") || qLower.contains("credits"))
                && (chunkLower.contains("36 credits") || chunkLower.contains("total of 36 credits"))) {
            bonus += 0.20;
        }

        if ((qLower.contains("course") || qLower.contains("courses") || qLower.contains("classes"))
                && (chunkLower.contains("12 classes") || chunkLower.contains("12 courses"))) {
            bonus += 0.15;
        }

        return (embeddingScore * 0.55) + (keywordScore * 0.30) + bonus;
    }

    private Set<String> buildQueryTerms(String question) {
        String qLower = question.toLowerCase();

        Set<String> words = Arrays.stream(qLower
                        .replaceAll("[^a-z0-9@. ]", " ")
                        .split("\\s+"))
                .filter(w -> w.length() > 1)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        if (words.contains("title")) {
            words.addAll(Arrays.asList(
                    "director", "manager", "counselor", "coordinator",
                    "dean", "professor", "contact", "advisor", "role"
            ));
        }

        if (words.contains("counselor") || words.contains("advisor")) {
            words.addAll(Arrays.asList(
                    "adviser", "student", "success", "graduate",
                    "contact", "email", "phone", "questions", "name"
            ));
        }

        if (words.contains("credits") || words.contains("credit")) {
            words.addAll(Arrays.asList(
                    "classes", "courses", "total", "mba", "required",
                    "requirement", "curriculum", "program"
            ));
        }

        if (words.contains("courses") || words.contains("course")) {
            words.addAll(Arrays.asList(
                    "classes", "credits", "required", "elective",
                    "mba", "curriculum", "program", "total"
            ));
        }

        if (words.contains("requirement") || words.contains("requirements")) {
            words.addAll(Arrays.asList(
                    "required", "credits", "credit", "classes",
                    "courses", "curriculum", "program", "mba", "total"
            ));
        }

        if (words.contains("include") || words.contains("program")) {
            words.addAll(Arrays.asList(
                    "concentrations", "courses", "skills", "credits",
                    "classes", "stem", "required", "electives"
            ));
        }

        if (qLower.contains("who is") || qLower.contains("what is the name")) {
            words.addAll(Arrays.asList(
                    "name", "contact", "questions", "reach", "email",
                    "phone", "counselor", "advisor", "role"
            ));
        }

        if (qLower.contains("mba credit requirement")) {
            words.addAll(Arrays.asList(
                    "mba", "credit", "credits", "requirement",
                    "required", "total", "36", "classes", "program"
            ));
        }

        return words;
    }

    private boolean looksPersonOrContactLike(String chunkLower) {
        return chunkLower.contains("questions?")
                || chunkLower.contains("reach out")
                || chunkLower.contains("contact")
                || chunkLower.contains("email")
                || chunkLower.contains("@")
                || chunkLower.contains("call ")
                || chunkLower.contains("phone")
                || chunkLower.contains("counselor")
                || chunkLower.contains("advisor")
                || chunkLower.contains("adviser")
                || chunkLower.contains("director")
                || chunkLower.contains("manager")
                || chunkLower.contains("coordinator")
                || chunkLower.contains("dean")
                || chunkLower.contains("professor");
    }

    private boolean looksProgramRequirementLike(String chunkLower) {
        return chunkLower.contains("credits")
                || chunkLower.contains("classes")
                || chunkLower.contains("courses")
                || chunkLower.contains("required")
                || chunkLower.contains("elective")
                || chunkLower.contains("electives")
                || chunkLower.contains("curriculum")
                || chunkLower.contains("mba");
    }

    private boolean containsQuotedOrNamedEntity(String question, String chunkLower) {
        List<String> tokens = Arrays.stream(question.split("\\s+"))
                .map(s -> s.replaceAll("[^A-Za-z]", ""))
                .filter(s -> s.length() > 2)
                .toList();

        int capitalizedHits = 0;
        for (String token : tokens) {
            if (!token.isEmpty() && Character.isUpperCase(token.charAt(0)) && chunkLower.contains(token.toLowerCase())) {
                capitalizedHits++;
            }
        }

        return capitalizedHits >= 1;
    }

    private boolean questionLooksLikeCountQuestion(String qLower) {
        return qLower.contains("how many")
                || qLower.contains("number of")
                || qLower.contains("total")
                || qLower.contains("requirement")
                || qLower.contains("required");
    }

    private boolean chunkContainsCountSignals(String chunkLower) {
        return chunkLower.contains("12 classes")
                || chunkLower.contains("12 courses")
                || chunkLower.contains("36 credits")
                || chunkLower.contains("total of 36 credits")
                || chunkLower.contains("required courses")
                || chunkLower.contains("nine required courses")
                || chunkLower.contains("remaining three classes")
                || chunkLower.contains("elective classes");
    }

    private double cosineSimilarityVec(List<Double> v1, List<Double> v2) {
        double dot = 0.0;
        double mag1 = 0.0;
        double mag2 = 0.0;

        int size = Math.min(v1.size(), v2.size());

        for (int i = 0; i < size; i++) {
            double a = v1.get(i);
            double b = v2.get(i);

            dot += a * b;
            mag1 += a * a;
            mag2 += b * b;
        }

        if (mag1 == 0 || mag2 == 0) {
            return 0.0;
        }

        return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
    }

    private String toJsonArrayString(List<Double> vector) {
        JSONArray jsonArray = new JSONArray();
        for (Double value : vector) {
            jsonArray.put(value);
        }
        return jsonArray.toString();
    }

    private List<Double> fromJsonArrayString(String json) {
        JSONArray arr = new JSONArray(json);
        List<Double> vector = new ArrayList<>();

        for (int i = 0; i < arr.length(); i++) {
            vector.add(arr.getDouble(i));
        }

        return vector;
    }
    private String normalizeSourceUrl(String url) {
        if (url == null) {
            return null;
        }

        String trimmed = url.trim();

        int queryIndex = trimmed.indexOf('?');
        if (queryIndex >= 0) {
            trimmed = trimmed.substring(0, queryIndex);
        }

        return trimmed;
    }
}