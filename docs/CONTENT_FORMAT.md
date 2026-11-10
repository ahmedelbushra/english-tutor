# Unit pack format (Grade 6, Top Goal 3)

One JSON file per unit: `content/g6/u0.json` (Welcome) … `u8.json` (Recent Events), `u9.json` (Goodbye).
Run `node tools/validate.mjs` after editing. It must print `OK`.

**Copyright rule:** use the book's syllabus (vocabulary words, grammar targets, topics). Every sentence,
example, reading text and question must be ORIGINAL. Do not copy book sentences, stories or dialogues.
Saudi context is welcome (names like Fahad, Nouf, Omar, Sara; places like Riyadh, AlUla, Jeddah).

```jsonc
{
  "id": "u1",                    // u0..u9
  "unit": 1,                     // 0 = Welcome, 9 = Goodbye
  "title": "Living Things",
  "emoji": "🦋",
  "color": "#2f9e44",            // unit accent colour (hex)
  "bigQuestion": "How are animals different from each other?",
  "summary": "One sentence for the teacher: what students learn in this unit.",
  "warmup": ["What is your favourite animal?", "..."],   // 3-5 discussion questions

  "vocab": [                     // ALL teaching words for the unit (both sets)
    { "word": "beetle", "pos": "noun", "set": 1, "cat": "Creatures",
      "meaning": "a small insect with a hard, shiny back",    // simple English, <= 12 words
      "example": "A green beetle is sitting on the leaf.",    // original, contains the word
      "emoji": "🪲" }
  ],
  // every vocab item has a "cat" (category). Each unit: 2-4 categories, each with >= 3 words.

  "grammar": [                   // usually 2 points (g1, g2). Welcome/Goodbye may have 3-4.
    {
      "id": "g1",
      "title": "Present Passive",
      "rule": "2-3 short, child-friendly sentences explaining when and how to use it.",
      "form": "object + am / is / are + past participle (+ by ...)",
      "examples": ["Insects are eaten by birds.", "Honey is made by bees."],   // 3-5
      "items": [ /* >= 20 items for a normal unit (>= 12 per point for u0/u9), mixed types:
                   >= 5 mc, >= 5 gap, >= 4 order, >= 3 transform, >= 3 fix */ ]
    }
  ],

  "reading": [                   // exactly 2 original texts, 120-220 words, unit topic
    { "id": "r1", "title": "...", "genre": "story | article | e-mail | blog post | interview",
      "text": "Paragraphs separated by \n\n",
      "questions": [ /* 5-6 items, types mc / tf / gap only */ ] }
  ],

  "wordWork": {                  // the unit's Word Work focus (e.g. word families, -ion, compounds)
    "title": "Word families", "rule": "1-2 sentences.",
    "items": [ /* 6-10 items, types mc / gap */ ]
  },

  "writing": [                   // 2 prompts
    { "prompt": "Write about an animal environment.", "hint": "Use: is where..., passive forms.",
      "minWords": 40, "model": "An original model answer of about minWords words." }
  ],

  "speaking": ["The desert is where camels live.", "..."]   // 6-8 short sentences to read aloud
}
```

## Item types
| type | fields | student sees |
|---|---|---|
| `mc` | `prompt`, `options` (3-4 strings), `answer` (exactly one of options) | choose one |
| `gap` | `prompt` with exactly one `___`, `answer` (string or array of accepted strings), optional `bank` (3-4 options incl. the answer), optional `hint` e.g. "(eat)" | type or tap the missing part |
| `order` | `answer` (full sentence, 4-10 words, ends with . or ?), optional `alt` (array of other accepted orders) | tap shuffled word chips into order |
| `transform` | `instruction` (e.g. "Make it passive."), `prompt` (sentence), `answer` (array of accepted full sentences) | rewrite the sentence |
| `fix` | `sentence`, `correct` (true/false), `answer` (the correct version; same as sentence if correct) | is this sentence right or wrong? |
| `tf` | `statement`, `answer` (true/false) | reading only: true or false |

Every item also has `explanation`: one short sentence that teaches why (shown after answering).
Answers are compared case-insensitively, ignoring extra spaces and the final full stop, and treating
contractions as written, so list both forms in `answer` arrays where both are fine
(`["has been", "'s been"]`).
