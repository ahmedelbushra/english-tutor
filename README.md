# English Tutor Studio

A private studio for one-on-one English lessons (built for Preply tutoring, Grade 6 *Top Goal 3* first):

- **Students:** a profile for each learner with a *progress orbit* (mastery per unit), skill bars,
  homework history and lesson notes.
- **Teach mode:** screen-share slides for every unit (words with audio, grammar rules, live practice
  questions, readings, a speaking drill, a word wheel) with a timer, stars and quick notes.
- **Homework missions:** built in a few clicks from about 550 original grammar questions plus vocabulary games,
  readings, speaking and writing. Paste one message into the lesson chat.
- **Results come back through the chat:** the student taps *Copy my result*, pastes it, and you click it.

Start here: **[docs/SETUP.md](docs/SETUP.md)**.

## Run it locally (to try it)

```
python -m http.server 8000
```
then open <http://localhost:8000>. (Opening `index.html` directly from the folder won't work, because browsers
block loading the lessons from `file://`.)

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/app.css` | The page and its design (light/dark, phone → projector) |
| `js/student/player.js` | The homework player students use |
| `js/exercises.js` | The 12 exercise types |
| `js/generator.js` | Builds varied homework sets from the unit packs |
| `js/teacher/*.js` | Studio, student pages, library, Teach mode, homework builder, results, settings |
| `js/students.js` | Students, notes, results, mastery, result links |
| `content/courses.json` | The list of books (courses); add a new book here |
| `content/g6/u0…u9.json` | Unit packs: words, grammar questions, readings, writing, speaking |
| `backend/Code.gs` | Google Apps Script that stores results in your Sheet |
| `docs/CONTENT_FORMAT.md` | How unit packs are written (for adding Grade 1 or editing content) |
| `tools/validate.mjs` | `node tools/validate.mjs` checks every unit pack |

All sentences, questions and reading texts are original. They follow the *Top Goal 3* syllabus (vocabulary
and grammar targets) but don't copy the book. Don't publish the PDF books.
