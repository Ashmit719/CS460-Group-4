package com.example.chatbot.controller;

import com.example.chatbot.model.User;
import com.example.chatbot.repository.UserRepository;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final UserRepository userRepository;

    public AuthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostMapping("/signup")
    public User signup(@RequestBody User user) {
        return userRepository.save(user);
    }

    @PostMapping("/login")
    public User login(@RequestBody User loginData) {
        return userRepository.findByEmail(loginData.getEmail())
                .filter(user -> user.getPassword().equals(loginData.getPassword()))
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));
    }
}