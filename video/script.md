# Launch video script (locked 2026-10-10, S7 step 3)

Read by `scripts/tts.py`: a `## <id>` heading opens a beat, the paragraph under it is the voice-over text, lines in
parentheses are stage directions and are skipped. Beats are short on purpose (one or two sentences) so every visual
event sits on the measured start of its own audio file, which is what keeps picture, voice and caption in sync
without a forced aligner. Target 110 to 125 s at the cloned voice's pace (measured 2.35 words/s): under 290 words. First draft (408 words) ran 174 s; second (337) 143 s; this one is ~312 words and plays at 1.1x (`TEMPO` in `src/timing.ts`, pitch preserved).

Research applied (2026-10-10, third-party guides on YC launch videos; YC's own guidance covers founder videos, not
product demos): hook inside five seconds, problem before product, the real product on screen by 20 to 30 s, one idea
per beat, 250 to 280 words total, the product shown doing real work rather than described, one ask at the end, a
"live" signal (date). For hiring managers: judgement, measurement and honesty over gloss.

Visual grammar: one console frame that never cuts within the product section (states morph in place, content swaps
behind a 120 ms opacity dip); Screen-Studio-style camera (zoom 1.3 to 1.4x towards the click, 700 ms out-expo, hold,
return) and an eased synthetic cursor with a 150 ms press; the aurora only behind the title and the close.

| id | visual | camera |
|---|---|---|
| hook | aurora, animated mark, wordmark, serif headline with italic gradient "evidence" | static |
| problem1 | plain canvas, serif line one | static |
| problem2 | serif line two, mono "Making Tax Digital for Income Tax · quarterly since 6 April 2026" | static |
| product | console frame scales in (0.96 to 1); dashboard with KPI tiles and pipeline card; demo banner visible | full |
| categorise1 | cursor to Categorise, press; rows resolve, confidence counts up, chips land | zoom 1.3x on Category/Confidence/Status |
| categorise2 | the needs-review row highlights | hold |
| explain1 | cursor clicks the row; drawer slides in from the right; DECISION, model chips | zoom 1.4x on the drawer |
| explain2 | REASONING paragraphs enter | hold |
| explain3 | RISK bar, three rules tick with strengths | hold |
| decide1 | content swap to the full transaction page; cursor presses Approve; chip flips to Confirmed | zoom on actions |
| decide2 | HISTORY gains the human row "Recorded in the audit log · now a precedent" | zoom on History |
| reconcile1 | content swap; press Reconcile; lines receive statuses | full |
| reconcile2 | line selected; candidates fill with three score bars; best row; Confirm match | zoom 1.3x on candidates |
| report | content swap; Generate PDF; job queued, running, completed; letter preview, figures count up | zoom on preview |
| built1 | frame recedes; "How it is built." serif; architecture diagram edges draw, nodes fade | static |
| built2 | six mono facts stagger in on the right | static |
| judgement1 | "Three things that needed judgement." line 01 | static |
| judgement2 | line 02 | static |
| judgement3 | line 03 | static |
| honest | "What is real." three lines | static |
| close | aurora returns; mark, wordmark, demo URL, GitHub URL, name, "open to AI engineering roles" | static |

## hook
Xero's AI now codes the books. The errors are still yours to find.

## problem1
Sign off a client's quarter and you are reviewing a model's work. A green tick is not evidence.

## problem2
Finding the three wrong lines in a hundred costs the same whether the books are ninety percent right or ninety-nine.

## product
AI Accountant sits after Xero's AI and before the sign-off. Here is a quarter's review, on a synthetic company.

## categorise1
Run categorise. Every transaction gets a category, a confidence score and a tier.

## categorise2
High confidence goes through. The uncertain ones come to you.

## explain1
Open one. The reasoning is written out, with the model that made the call.

## explain2
(reasoning paragraphs enter)
The question is no longer what happened. It is: do I agree?

## explain3
And a risk flag from eight plain-language rules: unusual amount, rare vendor, odd timing.

## decide1
Approve, correct or reject. A correction becomes a precedent, with no training on client data.

## decide2
Every decision, the model's and yours, lands in the audit trail.

## reconcile1
Reconcile matches bank lines to invoices and payments, with scores.

## reconcile2
Clear matches go through. Ambiguous ones wait for you.

## report
Then draft the management letter from the actual figures.

## built1
Now, for engineers. Next.js, FastAPI, and two LangGraph workflows calling Claude through Instructor, so every answer is validated before it is stored.

## built2
A fast model first, a stronger one when unsure. Thirty-four endpoints, ninety-three tests, one audit row per decision.

## judgement1
Three things needed judgement. Xero changed its OAuth scope scheme mid-build.

## judgement2
A CORS fix took production down in a loop: a browser type error, not a four-oh-one.

## judgement3
And a six-lens review of my own code found bugs the green test suite could not. I published them.

## honest
The live pipeline runs on a real Xero organisation. The demo is synthetic. And no accuracy claims without a reproducible evaluation.

## close
Try the demo, no account needed. Read the code on GitHub. And if you are hiring for AI engineering, let's talk.
