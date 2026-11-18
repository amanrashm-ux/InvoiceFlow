package com.invoiceflow.party;

import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/parties")
@CrossOrigin(origins = "*")
public class PartyController {
    private final JdbcTemplate jdbc;

    public PartyController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public List<Map<String, Object>> all() {
        return jdbc.queryForList("SELECT party_id AS \"partyId\",party_type AS \"partyType\",legal_name AS \"legalName\",email,country_code AS \"countryCode\",status FROM parties ORDER BY party_type,legal_name");
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id) {
        return jdbc.queryForList("SELECT party_id AS \"partyId\",party_type AS \"partyType\",legal_name AS \"legalName\",email,country_code AS \"countryCode\",status FROM parties WHERE party_id=?", id)
                .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Party not found"));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody PartyRequest request) {
        if (request.partyType() == null || request.legalName() == null || request.legalName().isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "partyType and legalName are required");
        String type = request.partyType().toUpperCase(Locale.ROOT);
        if (!type.equals("SUPPLIER") && !type.equals("BUYER"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "partyType must be SUPPLIER or BUYER");
        String country = request.countryCode() == null || request.countryCode().isBlank() ? "IN" : request.countryCode().toUpperCase(Locale.ROOT);
        if (country.length() != 2)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "countryCode must contain 2 characters");
        String id = (type.equals("SUPPLIER") ? "SUP-" : "BUY-") + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
        jdbc.update("INSERT INTO parties(party_id,party_type,legal_name,email,country_code,status) VALUES(?,?,?,?,?,'ACTIVE')",
                id, type, request.legalName().trim(), request.email(), country);
        return Map.of("partyId", id, "partyType", type, "legalName", request.legalName().trim(),
                "email", request.email() == null ? "" : request.email(), "countryCode", country, "status", "ACTIVE");
    }

    public record PartyRequest(String partyType, String legalName, String email, String countryCode) {
    }
}
