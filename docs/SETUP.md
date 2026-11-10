# How to use English Tutor Studio

A private studio for one-on-one English lessons (e.g. on Preply). You keep your students, lesson notes,
homework and results. Each student gets interactive homework through a link you paste into the lesson chat.

## The everyday loop

1. **Add a student:** Studio → *Add a student* (name, avatar, level, book, goal).
2. **Teach:** open the student → **▶ Teach** (or click any planet in their *progress orbit*).
   Share your screen in the Preply lesson. Keys: **→ / ←** move between slides, **R** shows the answer,
   **N** goes to the next question, **F** is full screen. The top bar has ⏱ *Timer*, ⭐ *Stars*
   (saved to the student) and 📝 *Notes* (saved to the student's page).
3. **Give homework:** on the student's page → **＋ Homework**. Pick units and a mix (Quick check, Full unit,
   Grammar focus…), swap any question with 🔄, then **Create**. Click **Copy message for the chat** and
   paste it into the Preply chat.
4. **The student** opens the link on any phone or computer (no account needed). It greets them by name.
   They do the tasks, get instant feedback and a "try again" round, and at the end tap **Copy my result**
   and paste it into the chat.
5. **You click the result link** in the chat. It opens your studio and saves the score, every answer, and
   any writing to mark on that student's page. Their progress orbit and skills update automatically.
   (If clicking doesn't open it, go to *Homework → Got a result in the chat?* and paste the message there.)

## Where your data lives

Everything (students, notes, homework, results) is saved **privately in your browser** on the computer you
use. Nothing is uploaded. So:

- Use the **same computer and browser** for your studio.
- Go to **Settings → Download backup** regularly. Use *Restore backup* to move to another computer.
- Students only ever see their own homework. The links contain questions, never other students' data.

## Making it a real online link (GitHub Pages, free)

The app is a simple website. To give students a link that works anywhere, it has to be hosted. GitHub Pages
does that for free:

1. Create a free account at <https://github.com>.
2. **New repository** → name it e.g. `english-tutor` → **Public** → *Create*.
3. *Uploading an existing file* → drag in everything from this folder **except the PDF books**
   (they're copyrighted, and the app doesn't need them) → *Commit changes*.
4. **Settings → Pages** → Branch `main`, folder `/ (root)` → *Save*. After 1–2 minutes your link appears,
   e.g. `https://your-name.github.io/english-tutor/`. Your studio is at that link + `#/t`.

(Claude can do these steps for you on request.)

## Optional: automatic results in Google Sheets

Not needed for Preply: the result link in the chat does the job. If you ever want results to arrive without
that step, follow the instructions in **Settings → Advanced** and paste `backend/Code.gs` into a Google
Sheet's Apps Script (Deploy → Web app → *Execute as: Me*, *Access: Anyone*).

## Adding more books later

Each book is a *course*, listed in `content/courses.json`. Its units live in their own folder as unit packs
(`docs/CONTENT_FORMAT.md`). A new book appears automatically in the Library and in the student form.
