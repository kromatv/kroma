use super::*;

pub(super) const PAGE_ROWS: usize = 2;

pub(super) struct Household {
    pub(super) survey: Value,
    pub(super) titles: Vec<(&'static str, Value)>,
    pub(super) states: Vec<((&'static str, &'static str), Value)>,
    pub(super) plays: Vec<Value>,
    pub(super) failing: Option<&'static str>,
    pub(super) stuck_on_a_cursor: bool,
    pub(super) asked: Vec<(String, Value)>,
}

#[derive(Clone)]
pub(super) struct OtherServer(pub(super) Arc<Mutex<Household>>);

pub(super) fn film(id: &str, name: &str) -> Value {
    json!({
        "id": id,
        "kind": "movie",
        "title": name,
        "paths": [format!("/data/movies/{name}/{name}.mkv")],
    })
}

pub(super) fn play(id: &str, user: &str, title: &str) -> Value {
    json!({ "id": id, "user": user, "title": title, "playedAt": 1_700_000_000 })
}

pub(super) fn household() -> OtherServer {
    let survey = json!({
        "libraries": [
            { "id": "1", "name": "Films", "kind": "movies", "folders": ["/data/movies"] },
            { "id": "2", "name": "Shows", "kind": "shows", "folders": ["/data/shows"] },
            { "id": "9", "name": "Music", "kind": "music", "folders": ["/data/music"] },
        ],
        "users": [
            { "id": "42", "name": "Ana", "signedIn": true, "allLibraries": true },
            { "id": "43", "name": "Ben", "libraries": ["1"] },
            { "id": "44", "name": "Cleo", "allLibraries": true, "stateLocked": true },
        ],
    });
    let titles = vec![
        ("1", film("t1", "Heat")),
        ("1", film("t2", "Ronin")),
        ("1", film("t3", "Thief")),
        ("1", json!({ "id": "x1", "kind": "track" })),
        (
            "2",
            json!({ "id": "e1", "kind": "episode", "season": 1, "episode": 1 }),
        ),
        ("9", json!({ "id": "m1", "kind": "track" })),
    ];
    let states = vec![
        (("42", "1"), json!({ "title": "t1", "watched": true })),
        (("42", "1"), json!({ "title": "t2", "positionMs": 90_000 })),
        (("42", "2"), json!({ "title": "e1", "watched": true })),
        (("43", "1"), json!({ "title": "t1", "watched": true })),
        (
            ("43", "1"),
            json!({ "title": "never-described", "watched": true }),
        ),
        (("44", "1"), json!({ "title": "t3", "watched": true })),
    ];
    let plays = vec![
        play("p1", "42", "t1"),
        play("p2", "43", "t2"),
        play("p3", "44", "t3"),
        play("p4", "nobody-kept", "t1"),
        play("p5", "42", "never-described"),
    ];
    OtherServer(Arc::new(Mutex::new(Household {
        survey,
        titles,
        states,
        plays,
        failing: None,
        stuck_on_a_cursor: false,
        asked: Vec::new(),
    })))
}

pub(super) fn paged(name: &str, rows: &[Value], body: &Value) -> Value {
    let from: usize = body["cursor"]
        .as_str()
        .map_or(0, |cursor| cursor.parse().unwrap());
    let page: Vec<&Value> = rows.iter().skip(from).take(PAGE_ROWS).collect();
    let mut answer = json!({ name: page });
    if from + PAGE_ROWS < rows.len() {
        answer["next"] = json!((from + PAGE_ROWS).to_string());
    }
    json!({ "Ok": answer })
}

impl Household {
    pub(super) fn answer(&mut self, method: &str, body: &Value) -> Value {
        self.asked.push((method.to_string(), body.clone()));
        if self.failing == Some(method) {
            return json!({ "Err": "the other server did not answer" });
        }
        match method {
            "survey" => json!({ "Ok": self.survey }),
            "titles" if self.stuck_on_a_cursor => {
                json!({ "Ok": { "titles": [film("t1", "Heat")], "next": "again" } })
            }
            "titles" => paged("titles", &self.titles_of(body), body),
            "states" => paged("states", &self.states_of(body), body),
            "plays" => paged("plays", &self.plays, body),
            _ => json!({ "Err": "not a method of this point" }),
        }
    }

    pub(super) fn titles_of(&self, body: &Value) -> Vec<Value> {
        self.titles
            .iter()
            .filter(|(library, _)| body["library"] == *library)
            .map(|(_, title)| title.clone())
            .collect()
    }

    pub(super) fn states_of(&self, body: &Value) -> Vec<Value> {
        self.states
            .iter()
            .filter(|((user, library), _)| body["user"] == *user && body["library"] == *library)
            .map(|(_, state)| state.clone())
            .collect()
    }
}

impl OtherServer {
    pub(super) fn importers(&self) -> Importers {
        let server = self.clone();
        let stub: StubFn =
            Arc::new(move |method, body| Some(server.0.lock().unwrap().answer(method, body)));
        Importers::new(Point::stubs(POINT, vec![(IMPORTER, stub)]))
    }

    pub(super) fn change(&self, change: impl FnOnce(&mut Household)) {
        change(&mut self.0.lock().unwrap());
    }

    pub(super) fn asked(&self, method: &str) -> Vec<Value> {
        let household = self.0.lock().unwrap();
        household
            .asked
            .iter()
            .filter(|(asked, _)| asked == method)
            .map(|(_, body)| body.clone())
            .collect()
    }

    pub(super) fn methods_asked(&self) -> Vec<String> {
        let mut methods: Vec<String> = Vec::new();
        for (method, _) in &self.0.lock().unwrap().asked {
            if methods.last() != Some(method) {
                methods.push(method.clone());
            }
        }
        methods
    }

    pub(super) fn forget_what_was_asked(&self) {
        self.0.lock().unwrap().asked.clear();
    }
}
