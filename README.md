# Stump the Profs

A live trivia game for ACM at UIC, where student teams play against professor teams. Each team answers from its own laptop, the questions and scores show on a projector, and the audience plays along on their phones.

It runs at **https://stumptheprofs.acmuic.org**.

![The projector after a question](docs/images/projector-revealed.png)

## Guides

| Guide | Read it if you are… |
|---|---|
| [Running the event](docs/run-the-event.md) | hosting or helping on the night. Checklist, host keys, what each screen shows, and what to do when something goes wrong. |
| [Before the event](docs/before-the-event.md) | preparing the game. Writing and uploading questions, music, running it on your own computer, updating the live site, and rehearsing. |

## How a question works

1. The host shows a question on every screen.
2. The host opens answers and a clock starts. Each team picks an answer and presses **BUZZ**. This locks the answer in, sealed, so only the host can see it.
3. Nobody says anything until answers close.
4. The host reads the sealed answers one by one. The fastest team goes first; after that it switches between Students and Professors. Each team says its answer out loud when it comes up.
5. The first right answer gets full points. Every other right answer gets a quarter.

Because every answer is sealed before anyone speaks, no team can copy another.

| Type | First right answer | Any other right answer |
|---|---|---|
| Free response | 300 | 75 |
| Multiple choice | 200 | 50 |
| True / false | 100 | 25 |

## The pages

| Page | For |
|---|---|
| `/` | Everyone: links to the team and audience pages. |
| `/player.html` | Each team's laptop: answer pad, buzzer, score and stats. |
| `/display.html?projector` | The projector: question, timer, answers, scores and the crowd. Also plays the music. |
| `/display.html` | The audience's phones: predict, answer along and cheer. |
| `/admin.html` | The host. Needs the admin key. |

## Try it on your computer

You need [Node.js](https://nodejs.org) 24.

```
npm install
cp .env.example .env    # then put a password after ADMIN_KEY=
npm run dev
```

Open `http://localhost:3000`. Run the automatic checks with `npm test`. The [preparation guide](docs/before-the-event.md#run-it-on-your-own-computer) has the details.

## Good to know

- **The real questions are not in this repo.** It is public, so the answers would be too. Questions are uploaded on the host page; see [Write the questions](docs/before-the-event.md#write-the-questions).
- **Every push to `main` goes live** after a restart in Argo CD (ACM's deploy dashboard). Do not push on event day.
- Built with Node.js, Express and Socket.IO (a library for live two-way messages between the server and browsers). The game is saved to disk after every change, so a restart does not lose it.
