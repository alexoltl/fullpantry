const express = require("express");
const axios = require("axios");
const cookieParser = require("cookie-parser");

const sqlite3 = require("sqlite3");
const db = new sqlite3.Database("users.db");

const login = require("./keys.json");
const url = "https://api.edamam.com/search";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cookieParser());

app.post("/search", (req, res) => {
    const searchQuery = req.body.query;
    axios.get(url, {
        params: {
            q: searchQuery,
            app_id: login.id,
            app_key: login.key
        }
    }).then(rezzy => {
        const firstResult = rezzy.data.hits[0];
        if (firstResult) {
            res.cookie("response", firstResult);
            res.send(firstResult);
        } else {
            res.status(404).send("No results found");
        }
    }).catch(error => {
        console.error(error);
        res.status(500).send("An error occurred while processing your request");
    });
});

app.post("/register", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    db.run("CREATE TABLE IF NOT EXISTS logins(username text NOT NULL UNIQUE, password text NOT NULL)");
    db.run("INSERT INTO logins ");
});

app.listen(727, () => {
    console.log("localhost:727");
});
