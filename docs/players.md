# How to play Stump the Profs

Students and professors race to answer computer science questions. Teams play on laptops; everyone else plays along on their phones. This page explains both.

**The site:** https://stumptheprofs.acmuic.org

## The rules in short

- Every question has a clock: 30 seconds for typed answers, 20 for multiple choice, 15 for true or false.
- Pick your answer, then press **BUZZ**. That locks it in, sealed. Nobody but the host can see it, and you cannot change it.
- When answers close, the host reads them out one by one: the fastest team first, then switching between Students and Professors.
- The first right answer gets full points (300 typed, 200 multiple choice, 100 true or false). Every other right answer gets a quarter.
- Some multiple choice questions say **Pick all that apply**. Select every choice you think is right. All of them counts as a right answer. Some of them, with no wrong ones, is **Partly right** and earns a few points. Any wrong choice earns nothing.
- A wrong answer, or no answer, costs nothing. Always lock in your best guess.
- Some questions have a picture. It shows on your screen as well as on the projector.

## For teams

Each team plays on one laptop. Open **https://stumptheprofs.acmuic.org**, click **Players**, type a team name, pick Students or Professors, and click **Join the game**. Write down the **rejoin code** shown at the bottom right of your screen once you are in.

![Joining as a team](images/player-join.png)

This is what you do for every question.

```mermaid
flowchart TD
    Q["A question appears<br/>Read it and pick an answer.<br/>You can change your pick."] --> O["Answers open<br/>The clock starts"]
    O --> B["Press BUZZ<br/>Your answer is locked in and sealed.<br/>You cannot change it now."]
    B --> W["Wait quietly<br/>until answers close"]
    W --> T["YOUR TURN<br/>Say your answer out loud"]
    T --> R["The host or the game rules on it.<br/>The question ends when someone is right."]
    R --> Q
```

1. **A question appears.** Read it. Click the answer you think is right (or type it, for free response). On **Pick all that apply**, click every answer you think is right; click one again to unpick it. You can change your pick as often as you like until you press BUZZ.
2. **Answers open** and a clock starts on your screen. The button now says **BUZZ**.
3. **Press BUZZ** to lock in your pick. Your answer is sealed: only the host can see it. You cannot change it. The faster you buzz, the earlier your answer is read.

   | Picking an answer | After pressing BUZZ |
   |---|---|
   | ![Picking an answer](images/player-pick.png) | ![Locked in](images/player-locked.png) |

   On a **Pick all that apply** question, the chips above the question say so. Click every answer you think is right; the chosen ones turn dark.

   ![Two answers picked on a Pick all that apply question with a picture](images/player-pick-all.png)

4. **Stay quiet** until answers close. Saying your answer early only helps the other teams.
5. **When the button says YOUR TURN,** say your answer out loud. The screen shows it so you read it exactly as you locked it in.

   ![Your turn](images/player-your-turn.png)

6. **The result shows on the button.** Your score, rank and stats update on the right.

   ![After the question](images/player-revealed.png)

**If you do not buzz before the clock runs out,** you have no answer for that question and score nothing. A wrong answer also scores nothing; it never takes points away. So it is always worth locking in your best guess.

### What the big button means

| Button says | Colour | What it means |
|---|---|---|
| **WAIT** | Grey | No question yet, or the question is showing but answers are not open. You can already pick. |
| **PICK** | Grey | Answers are open. Choose an answer first. |
| **BUZZ** | Red | Press it to lock in the answer shown under the word. |
| **TIME** | Grey | The clock ran out before you buzzed. |
| **LOCKED IN** | Red, pressed in | Your answer is sealed. While answers are open it shows your buzz order ("You were 2nd to buzz"). Once reading starts it shows your place ("Yours is read 3rd"). |
| **YOUR TURN** | Yellow | Say your answer out loud now. |
| **WRONG** | Grey, pressed in | Your answer was read and it was not right. |
| **PARTLY RIGHT** | Grey, pressed in | Pick all that apply: you found some of the right answers and no wrong ones. Other teams are still read. Your points are added when the question ends. |
| **NO ANSWER** | Grey, pressed in | You did not lock in before answers closed. |
| **FINISHED** | Green | The host ended the game. It says where you finished and which side won. |
| **DONE** | Green | The question is over. It says how you did: "Correct!", "Also right!", "Partly right!", who got it, or "The host will mark your answer" (free response). |

### Keyboard shortcuts

| Key | Does |
|---|---|
| **A** to **F** | Pick choice A to F (multiple choice). On Pick all that apply, press again to unpick. |
| **T** / **F** | Pick True / False |
| **Space** | BUZZ |
| **Enter** | BUZZ, while typing a free-response answer |

### The rest of your screen

- **Score, rank and side:** your points, your place among all teams, and how far your side (Students or Professors) is ahead or behind.
- **The bar:** Students' total against Professors' total.
- **Your stats:** how often you were first to buzz, accuracy, average and fastest reaction time (from answers opening to your buzz), right and wrong answers, steals (winning after another team was wrong) and "also right" answers.
- **History:** how you did on each finished question.
- **Rejoin code:** bottom right. Write it down. On another laptop, type it in the box under **Join the game** to get back in.

## For the audience

Anyone can play along on a phone. Open the home page, tap **Display**, type a nickname (up to 20 characters, not already taken) and tap **Join**. The phone shows the same question, timer and scores as the projector, with a **Play along** box.

![The phone view](images/phone.png)

For every question:

1. **Predict who gets it** when the question appears: **Students**, **Profs** or **Nobody**. You can change your mind until answers open.
2. **Answer along** while the teams are answering (multiple choice and true/false only). Tap one answer. You cannot change it. On **Pick all that apply** questions you still tap one; any of the right answers counts. It closes when the teams' answers close.
3. **Watch the answers** being read out on the projector or your phone.
4. **See how you did.** After the answer is shown, the box says "Prediction right!", "Answer right!" or that you missed.

At any time:

- **Cheer** with the **Go Students!** and **Go Profs!** buttons. The cheer meter on the projector shows which side is loudest right now; it fades when people stop.

Playing along is just for fun: the phone tells you whether you were right, but the audience does not score points. Only the players compete.

The phone remembers you. If the page closes, open it again and you are back in. If the host resets the game, everyone joins again.

At the end, the host shows the **final results** on every screen, including your phone: the winning side, every player ranked by score, and awards for the fastest buzz, most often first to buzz, and most steals.

Questions during the game? Ask one of the hosts.
