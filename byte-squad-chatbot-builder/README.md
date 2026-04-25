# CS460W-Group-4
# Tiny Transformer Lab: How This App Works (Very Simple Version)

This document explains the project in extreme everyday language.

## 1) What this app is, in one sentence

This app lets you paste your own text, train a tiny chatbot brain on it, and then chat with that trained brain directly in your browser.

## 2) Think of it like this

- Your dataset = a giant notebook of examples.
- The model = a student.
- Training = the student studying the notebook over and over.
- Generation = the student trying to continue your sentence in the same style.

So you are basically building a custom "mini writing style imitator."

## 3) Big picture flow

```text
You paste text
   ->
App cleans text and turns it into tokens
   ->
Model is reset and learns patterns from the tokens
   ->
You type a prompt
   ->
Model predicts next token again and again
   ->
You get generated output
```

## 4) Files and what each one does

- `chatbot.html`
  - The page layout (all visible sections and buttons).
- `style.css`
  - The visuals (colors, spacing, fonts, panel style).
- `app.js`
  - Connects page buttons/inputs to the real logic.
- `train.js`
  - Main brain manager: data apply, training loop, generation, dashboard updates.
- `model.js`
  - The actual math of the mini transformer and optimizer updates.
- `tokenizer.js`
  - Converts text <-> token IDs (BPE token mode).
- `presets.js`
  - Auto-detects dataset type and sets good default knobs.
- `storage.js`
  - Export/import model as JSON so you can save/load work.
- `start-server.bat`
  - Starts a local server and opens the app in browser.

## 5) What happens when you click "Apply data"

1. App reads the dataset text box.
2. It optionally normalizes text (cleans odd characters/spaces).
3. It builds a BPE vocabulary (common chunks/word pieces).
4. It converts dataset text into token IDs.
5. It splits tokens into training part and validation part.
6. It rebuilds model weights to match this vocab/setup.
7. It runs a quick baseline loss check and updates dashboard.

In plain language: "Take my text, translate it into numbers the model can study, then give the model a fresh notebook and start line."

## 6) How BPE mode splits your dataset (full algorithm, plain English)

Think of BPE as:
- Start with tiny pieces.
- Repeatedly glue together piece pairs that appear a lot.
- Use those learned pieces to split all text into token IDs.

### Part A: How the app learns BPE pieces from your dataset

1. Start from your normalized dataset text.
2. Build a base symbol set from all characters seen in the text.
3. Add two special tokens:
   - `PAD` (padding)
   - `EOS` (end-of-sequence)
4. Take a large sample of the dataset (controlled by `Sample chars`).
5. Find "words" using non-whitespace chunks and count how often each word appears.
6. For each word, represent it as a list of characters.
7. Repeat merge learning until target vocab size is reached (or no useful pair remains):
   - Count all adjacent symbol pairs across all words.
   - Weighted by word frequency (common words count more).
   - Pick the most frequent pair (example: `"h"` + `"e"`).
   - Merge that pair everywhere in the word symbol lists (now `"he"` is one symbol).
   - Record merge order (this order becomes the BPE rank table).
8. Final vocabulary becomes:
   - `[PAD, EOS, base characters, merged symbols...]`

So the vocabulary is not random. It is built directly from repeated patterns in your dataset.

### Part B: How the app uses learned BPE to split the full dataset

1. Scan the text left to right.
2. Keep non-whitespace characters in a word buffer.
3. When whitespace is reached:
   - Flush the buffered word through BPE merge rules.
   - Emit the whitespace itself as its own token (space/newline matter).
4. Word flush (actual BPE splitting):
   - Start with characters of that word.
   - Repeatedly find the highest-priority merge pair currently present.
   - Merge that pair.
   - Continue until no ranked pair is left.
   - Result is the final token pieces for that word.
5. Map each resulting token piece to its integer ID.
6. Append `EOS` at the end of the dataset token stream.

### Mini example

If your text has many words like `hello`, `help`, `held`, then pairs like `h+e` and maybe `he+l` become frequent.
Over merges, the model may learn pieces like:
- `he`
- `hel`
- `llo`

Then `hello there` might split more like:
- `hello`, ` `, `there`
or
- `hel`, `lo`, ` `, `the`, `re`

It depends on what patterns were most frequent in your dataset.

### Why this matters

- Common chunks become single tokens, so sequences are shorter.
- Shorter sequences usually train better and generate cleaner text structure.
- Whitespace/newlines stay meaningful, so formatting style is learned too.

## 7) What happens during training

Training is repeated many times in tiny bursts so the UI stays responsive.

Each mini step:
1. Pick a random window of tokens from training data.
2. Ask model to predict "what comes next" at each position.
3. Compare predictions vs actual next tokens (loss).
4. Compute how wrong it was.
5. Nudge internal weights to reduce that error.
6. Repeat.

The dashboard then shows:
- Train loss / val loss
- Perplexity
- "Generalization" style gauge
- Dataset coverage meter ("gobble meter")
- Simple quality cards (repetition, novelty, copying)

In plain language: "The student keeps taking tiny quizzes and adjusts based on mistakes."

### Training math (in plain English)

Behind the scenes, each training step is basically:

1. The model sees a short token sequence.
   Equation: `x = [x1, x2, ..., xT]`
2. At each position, it tries to predict the next token.
   Equation: `z_t = f_theta(x_{<=t})`
   Concrete example (next-token training):
   - Tokens: `[User, :, hello, there, EOS]`
   - Input sequence: `[User, :, hello, there]`
   - Target sequence: `[:, hello, there, EOS]`
   - So the model learns:
     - given `User` -> predict `:`
     - given `User :` -> predict `hello`
     - given `User : hello` -> predict `there`
     - given `User : hello there` -> predict `EOS`
   This is why it is called next-token prediction: target is just input shifted by one position.
3. It gives a probability to every possible next token.
   Equation: `p_t(i) = exp(z_t(i)) / sum_j exp(z_t(j))`
4. It checks the true next token from your dataset.
   Equation: `y_t = x_{t+1}`
5. It calculates penalty using cross-entropy loss.
   Equation: `L_t = -log(p_t(y_t))`
   Total step loss: `L = (1/N) * sum_t L_t`
   If it was confidently wrong -> big penalty. If it was confidently right -> small penalty.
6. It then asks: "Which internal numbers caused this error?" (backpropagation)
   Equation: `g = dL/dtheta`
7. Using those gradients, it nudges weights in the direction that should reduce future error.
   Basic update equation: `theta_new = theta_old - eta * g`
   Adam-style idea used in app: `theta <- theta - eta * (m / (sqrt(v) + eps))`
8. It repeats this thousands of times.
   Equation: `for step = 1..K: compute L, compute g, update theta`

What is happening in the model during that step:
- Token IDs -> embedding vectors.
- Add position vectors (so order matters).
- Build Q, K, V vectors and attention scores.
- Attention decides what earlier tokens matter most for each position.
- Model outputs logits (raw scores for every vocab token).
- Softmax turns logits into probabilities.
- Loss + backprop update the weights.

In plain language:
"Training is repeated next-token quiz questions. The model guesses, gets graded, and updates its internal numbers so future guesses are better."

## 8) What happens when you click "Generate"

Important first:
- Pressing `Generate` does **not** train the model.
- No weights are updated.
- It only uses what was already learned during training.

### Generate algorithm (step by step)

1. Read your prompt text.
2. Normalize prompt (if toggle is on), then BPE-tokenize it into token IDs.
3. If the prompt is longer than block size, keep only the latest part (recent context).
4. "Warm up" model context cache by feeding the prompt tokens in order.
5. Start a loop to create up to `Max new tokens`:
   - Compute logits (next-token scores) from current context.
   - Block the `PAD` token from being selected.
   - Apply repetition penalty to recently used tokens.
   - If `no-repeat n-gram` is on, ban next tokens that would repeat banned phrase patterns.
   - Choose next token:
     - Greedy on: pick highest score token.
     - Greedy off: sample with temperature + top-k + top-p.
   - Append chosen token to output and context cache.
6. Decode generated token IDs back into text.
7. Show final output as: `prompt + generated continuation`.
8. Update confidence/quality indicators in the UI.

In plain language:
"Generate is the model doing autocomplete repeatedly, one token at a time, using your sampling rules. It remembers only the current context window, not new long-term learning."

## 9) Simple explanation of key knobs

- Learning rate:
  - "How big each correction step is."
- Block size:
  - "How much recent context the model can look at."
- d_model:
  - "How wide the model brain is."
- Steps per tick / budget ms:
  - "How hard the CPU works each UI cycle."
- Temperature:
  - "How creative/random output feels."
- Top-k:
  - "Only consider top K likely next tokens."
- Top-p:
  - "Only consider tokens within top probability mass."
- Repetition penalty:
  - "Discourage repeating recent tokens."
- No-repeat n-gram:
  - "Hard block certain repeated short phrases."

## 10) Why this is cool

- Fully local in-browser training/inference (no cloud model needed).
- You can train on your own custom text style quickly.
- It is educational: you can actually see learning behavior live.
- You can save and reload model snapshots.

## 11) Current limitations (normal for this size project)

- Tiny model compared to modern LLMs.
- Training quality depends heavily on dataset quality and size.
- Long training can still become unstable if settings are bad.
- It is best for style imitation and short-form patterns, not deep reasoning.

## 12) "Did moving folders break it?" (quick answer)

Potentially yes, but mostly around launch/setup paths:
- VS Code launch path was fixed to `${workspaceFolder}/chatbot.html`.
- The app itself loads fine when served with a local server.

Use one of these:
- Double-click `start-server.bat`
- or run `npx http-server -p 8000` and open `http://localhost:8000/chatbot.html`

Do not open via `file://` directly.

## 13) 30-second demo script for non-technical audience

1. "I paste a custom dataset."
2. "I click Apply data so the app turns text into a learnable format."
3. "I start training and watch loss drop."
4. "Now I type a prompt in the same style."
5. "The model predicts text one token at a time."
6. "I can save this trained model and reload it later."

That is the full project in plain terms.
