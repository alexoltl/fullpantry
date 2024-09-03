const express = require("express");
const axios = require("axios");
const cookieParser = require("cookie-parser");

const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const db = new sqlite3.Database("database.db");

const login = require("./keys.json");
const url = "https://api.edamam.com/search";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.json());
app.use(cookieParser());

app.post("/search", (req, res) => {
    const searchQuery = req.body.query;
    axios.get(url, {
        params: {
            q: searchQuery,
            app_id: login.id,
            app_key: login.key
        }
    }).then(recipes => {
        const firstResult = recipes.data.hits[0];
        console.log(firstResult);
        if (firstResult) {
            res.status(200).json({ message: firstResult });
        } else {
            res.status(404).json({ error: "No results found" });
        }
    }).catch(error => {
        console.error(error);
        res.status(500).json({ error: "An error occurred while processing your request"});
    });
});

app.post("/register", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }
    
    // security stuff
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ error: "Error hashing password" });
        }
        
        db.run("CREATE TABLE IF NOT EXISTS logins(username TEXT NOT NULL UNIQUE, password TEXT NOT NULL)", (err) => {
            if (err) {
                return res.status(500).json({ error: "Error creating table" });
            }
            
            const query = "INSERT INTO logins (username, password) VALUES (?, ?)";
            db.run(query, [username, hashedPassword], function(err) {
                if (err) {
                    // unique constraint failed (username already exists)
                    if (err.code === 'SQLITE_CONSTRAINT') {
                        return res.status(409).json({ error: "Username already exists" });
                    }
                    return res.status(500).json({ error: "Error inserting user" });
                }
                return res.status(201).json({ message: "User registered successfully" });
            });
        });
    });
});

app.post("/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    const query = "SELECT password FROM logins WHERE username = ?";
    db.get(query, [username], (err, row) => {
        if (err) {
            return res.status(500).json({ error: "Error querying the database" });
        }

        if (!row) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        bcrypt.compare(password, row.password, (err, result) => {
            if (err) {
                return res.status(500).json({ error: "Error comparing passwords" });
            }

            if (result) {
                return res.status(200).json({ message: "Login successful" });
            } else {
                return res.status(401).json({ error: "Invalid username or password" });
            }
        });
    });
});


app.listen(727, () => {
    console.log("localhost:727");
});
