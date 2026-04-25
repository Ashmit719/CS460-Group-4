package com.example.chatbot.controller;

import com.example.chatbot.model.User;
import com.example.chatbot.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final UserRepository userRepository;

    @Value("${app.admin.signup.code:}")
    private String adminSignupCode;

    public AuthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostMapping("/signup")
    public Map<String, Object> signup(@RequestBody Map<String, String> payload) {
        String name = safe(payload.get("name"));
        String email = safe(payload.get("email")).toLowerCase();
        String password = safe(payload.get("password"));
        String pin = safe(payload.get("pin"));
        String adminAccessCode = safe(payload.get("adminAccessCode"));

        if (name.isBlank() || email.isBlank() || password.isBlank() || pin.isBlank()) {
            throw new RuntimeException("Name, email, password, and PIN are required.");
        }

        if (!pin.matches("\\d{6}")) {
            throw new RuntimeException("PIN must be exactly 6 digits.");
        }

        if (userRepository.existsByEmail(email)) {
            throw new RuntimeException("An account with this email already exists.");
        }

        String role = "USER";
        if (!adminAccessCode.isBlank()) {
            if (adminSignupCode.isBlank() || !adminSignupCode.equals(adminAccessCode)) {
                throw new RuntimeException("Invalid admin access code.");
            }
            role = "ADMIN";
        }

        User user = new User();
        user.setName(name);
        user.setEmail(email);
        user.setPassword(password);
        user.setPin(pin);
        user.setRole(role);

        User saved = userRepository.save(user);
        return userResponse(saved);
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> payload) {
        String email = safe(payload.get("email")).toLowerCase();
        String password = safe(payload.get("password"));

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Invalid email or password."));

        if (!user.getPassword().equals(password)) {
            throw new RuntimeException("Invalid email or password.");
        }

        return userResponse(user);
    }

    @PostMapping("/reset-password")
    public Map<String, Object> resetPassword(@RequestBody Map<String, String> payload) {
        String email = safe(payload.get("email")).toLowerCase();
        String pin = safe(payload.get("pin"));
        String newPassword = safe(payload.get("newPassword"));

        if (email.isBlank() || pin.isBlank() || newPassword.isBlank()) {
            throw new RuntimeException("Email, PIN, and new password are required.");
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found."));

        if (!user.getPin().equals(pin)) {
            throw new RuntimeException("Invalid PIN.");
        }

        user.setPassword(newPassword);
        userRepository.save(user);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("message", "Password reset successfully.");
        return response;
    }

    @PutMapping("/update-profile")
    public Map<String, Object> updateProfile(@RequestBody Map<String, String> payload) {
        Long id = Long.parseLong(safe(payload.get("id")));
        String name = safe(payload.get("name"));
        String email = safe(payload.get("email")).toLowerCase();
        String pin = safe(payload.get("pin"));

        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found."));

        if (name.isBlank() || email.isBlank() || pin.isBlank()) {
            throw new RuntimeException("Name, email, and PIN are required.");
        }

        if (!pin.matches("\\d{6}")) {
            throw new RuntimeException("PIN must be exactly 6 digits.");
        }

        if (!user.getEmail().equalsIgnoreCase(email) && userRepository.existsByEmail(email)) {
            throw new RuntimeException("Another account already uses this email.");
        }

        user.setName(name);
        user.setEmail(email);
        user.setPin(pin);

        User saved = userRepository.save(user);
        return userResponse(saved);
    }

    @PutMapping("/change-password")
    public Map<String, Object> changePassword(@RequestBody Map<String, String> payload) {
        Long id = Long.parseLong(safe(payload.get("id")));
        String currentPassword = safe(payload.get("currentPassword"));
        String newPassword = safe(payload.get("newPassword"));

        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found."));

        if (!user.getPassword().equals(currentPassword)) {
            throw new RuntimeException("Current password is incorrect.");
        }

        if (newPassword.isBlank()) {
            throw new RuntimeException("New password is required.");
        }

        user.setPassword(newPassword);
        userRepository.save(user);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("message", "Password changed successfully.");
        return response;
    }

    @PutMapping("/admin/reset-user-password")
    public Map<String, Object> adminResetUserPassword(@RequestBody Map<String, String> payload) {
        Long adminId = Long.parseLong(safe(payload.get("adminId")));
        String targetEmail = safe(payload.get("targetEmail")).toLowerCase();
        String targetPin = safe(payload.get("targetPin"));
        String newPassword = safe(payload.get("newPassword"));

        User admin = userRepository.findById(adminId)
                .orElseThrow(() -> new RuntimeException("Admin user not found."));

        if (!"ADMIN".equalsIgnoreCase(admin.getRole())) {
            throw new RuntimeException("Unauthorized.");
        }

        User targetUser = userRepository.findByEmail(targetEmail)
                .orElseThrow(() -> new RuntimeException("Target user not found."));

        if (!targetUser.getPin().equals(targetPin)) {
            throw new RuntimeException("Target PIN is incorrect.");
        }

        if (newPassword.isBlank()) {
            throw new RuntimeException("New password is required.");
        }

        targetUser.setPassword(newPassword);
        userRepository.save(targetUser);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("message", "User password reset successfully.");
        return response;
    }

    private Map<String, Object> userResponse(User user) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", user.getId());
        response.put("name", user.getName());
        response.put("email", user.getEmail());
        response.put("role", user.getRole());
        response.put("pin", user.getPin());
        return response;
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }
}