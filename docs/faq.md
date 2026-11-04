# Frequently asked questions

Short answers to common questions about Stump the Profs. Each one links to the guide with the details.

**The site:** https://stumptheprofs.acmuic.org

## Playing on a team

**Do we need to install anything or make an account?**
No. Open the site in a browser on one laptop per team, click **Players**, type a team name, pick a side and join.

**Can we change our answer after pressing BUZZ?**
No. BUZZ locks it in. Before that, you can change your pick as often as you like.

**Nobody speaks until answers close. So why buzz fast?**
Answers are read out fastest first. The first right answer that is read gets full points; later right answers get a quarter.

**Can other teams see our answer?**
Not until it is read out. Until then only the host can see it.

**Do wrong answers lose points?**
No. A wrong answer, or no answer, scores 0. Always lock in your best guess.

**What if two teams buzz at almost the same moment?**
The server decides, using its own clock. Whichever BUZZ reaches it first is first. The laptops' clocks do not matter.

**We pressed BUZZ just as the clock hit zero. Does it count?**
Yes, if it reaches the server within three quarters of a second of zero. That allows for slow Wi-Fi. After that, BUZZ is refused.

**What does "Pick all that apply" mean?**
More than one choice is right. Select every choice you think is right, then buzz.
- All of the right choices and nothing else: a right answer, scored like any other.
- Some of them and nothing wrong: **Partly right**, a smaller share of the points.
- Any wrong choice: 0.

See [More than one right answer](before-the-event.md#more-than-one-right-answer) for the exact points.

**Our laptop crashed. Did we lose our points?**
No. Points belong to the team, not the laptop. Open the team page again in the same browser and you are back in. On another laptop, type your **rejoin code** under **Join the game**. If you lost the code, the host can read it to you. ([How to play](players.md#for-teams))

**Can we rename our team or switch sides?**
Not yourselves. Ask the host.

**What is a "steal"?**
Winning a question after another team's answer was read first and was not right.

**What do the words on the big button mean?**
See [What the big button means](players.md#what-the-big-button-means).

## In the audience

**How do I play along?**
Open the site on your phone, tap **Display**, and join with a nickname (up to 20 characters). Predict which side wins the night, cheer for your side, and follow every question. ([How to play](players.md#for-the-audience))

**Does the audience score points?**
No. Your prediction is just for fun; at the end your phone says whether you called it. Only the players compete. The cheer meter only shows which side is loudest.

**Why can't I change my prediction?**
Predictions lock when the host opens answers on the first question, so nobody can wait to see which side pulls ahead. If you joined after that, you can still watch and cheer.

**My phone closed the page.**
Open it again in the same browser and you are back in. If the host reset the game, join again.

## Hosting

**I marked an answer wrong by mistake.**
Press **Z** (Undo) straight away. If the question has already ended, use **Adjust** on that team instead. ([When something goes wrong](run-the-event.md#when-something-goes-wrong))

**Can I skip a question?**
There is no skip button; **N** always shows the next question in the file. To skip one on the night, press **N**, **O**, then **R** straight away: the answer shows and nobody scores. Better: take it out of the file before the event.

**Can I go back to an earlier question?**
No. Undo steps back through your last 30 actions, but there is no way to replay a finished question.

**How does a team rename itself or switch sides?**
Between questions, click **Remove** next to the team and have it join again with the new name or side. Its score starts at 0, so use **Adjust** to give its points back.

**Who wins the night?**
The side with more points. After the last question, the host presses **F** to show the final results on every screen: the winning side, every player ranked, and a few awards. ([The end of the game](run-the-event.md#the-end-of-the-game)) Equal totals show as a tie; the game does not break ties itself. If you want a tiebreaker, put a spare question at the end of the questions file, because questions cannot be added once the game has started.

**What happens if the server restarts during the game?**
Nothing is lost. The game is saved after every change and comes back where it was in under a minute. Every page reconnects by itself. Only the Undo history is lost.

**Can the teams see the answer on my screen?**
Yes, if they can see it. The host page shows the right answer and every sealed answer. Keep it facing away from the teams and off the projector.

**A question's picture is missing.**
See the [troubleshooting table](run-the-event.md#when-something-goes-wrong).

## Questions, pictures and music

**Where are the questions kept? Could someone find the answers?**
On ACM's server, uploaded through the host page. They are never in the code on GitHub, which is public. No team or phone is sent an answer before it is revealed, and an uploaded picture only becomes available when its question is shown. ([How it fits together](before-the-event.md#how-it-fits-together))

**Can I change the questions during the event?**
No. Questions can only be uploaded before the first question is shown. Changing them later means **Reset game…**, which clears every team and score.

**How do I add a picture to a question?**
Put the picture's file name in the question's `image` field, then upload the picture on the host page with **Upload pictures…**. ([Pictures](before-the-event.md#pictures))

**How do I write a question with several right answers?**
Make it multiple choice and write the answer as a list, like `"answer": [0, 2]`. ([More than one right answer](before-the-event.md#more-than-one-right-answer))

**Can one question have more time or more points?**
Yes. Add `"seconds": 45` or `"points": 500` to that question in the file. ([Write the questions](before-the-event.md#write-the-questions))

**Why won't a YouTube video play?**
Some owners do not allow their videos to play on other sites. The host page says so when that happens. Pick a different video, and test every link before the night. ([Music](before-the-event.md#music))

## Technical

**Which Wi-Fi works?**
UIC Wi-Fi and phone data. The ACM and Maid Café Wi-Fi do not open the site yet. ([Known issues](before-the-event.md#known-issues))

**Which browsers work?**
Any up-to-date browser on a laptop or phone. The projector computer also needs to reach YouTube for music.

**How many teams can play?**
The game has no limit. The projector's layout has been checked with 6 teams; more fit, but the lists get crowded.

**What is stored about us?**
Team names, nicknames, scores and answers, on ACM's server, for this game only. There are no accounts or emails. **Reset game…** clears it all.

**Where is the code explained?**
In [How the code works](developers.md).
