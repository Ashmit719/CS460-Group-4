package com.example.chatbot.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.stereotype.Service;

@Service
public class WebScraperService {

    public String extractText(String url) {
        try {
            Document doc = Jsoup.connect(url).get();
            return doc.body().text();
        } catch (Exception e) {
            return "Error fetching webpage.";
        }
    }
}