# The Department of Definitely Not Alarming Readings

![The Department of Definitely Not Alarming Readings live UI](docs/assets/live-ui.png)

[Consult the Totally Credible Needle](https://extremely-normal-readings.davidyen1124.workers.dev)

A fullscreen instrument for determining whether your browser is radiating vibes, concern, or merely the usual amount of modern software regret.

It observes a few harmless environment signals, asks a Worker-side AI endpoint what level of theatrical blinking is appropriate, and then moves a needle with the quiet authority of equipment last calibrated during a budget meeting.

No buttons. No dashboard. No SVGs. No useful certification. Just a glowing green lamp insisting everything is fine, which is how you know the process is working.

## Run

```sh
npm install
npm run dev
```

## Check

```sh
npm run build
```

## Deploy

```sh
npm run deploy
```

The `/api/react` route uses a Worker-side `AI_URL` environment variable. If that variable is absent or the upstream service decides to practice emotional distance, the detector falls back locally and continues pretending this was always the plan.
