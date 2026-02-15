# Deporia

Media aporia no more!

Deporia flags content embedded in webpages likely to be AI-generated or manipulated with a warning border. AI manipulation reports are submitted by users, and tracked using our backend. Data is stored in Valkey, ensuring fast read/writes and access by image hash.

## Why?

Even the most hardened whiskey-drinking detectives can't always figure out when media is AI-manipulated. Our project leverages the fact that the crowd is often better at making a judgement call than anybody alone. Anybody can submit a report if a piece of media is AI-generated/manipulated or human-generated.

<!--This limit is implemented client-side for the purposes of an MVP. A production application would need an account to protect users.-->

## Static demo (must have extension installed to see borders)

### AI-manipulated image

![Pope francis puffer jacket](https://i.imgur.com/3zZIiwI.png)

### Safe, human-generated image

![Neo-noir](https://i.imgur.com/HuK8Xug.jpeg)

### Screenshots

If you haven't installed the extension, here are some examples of what an annotated website will look like:

![This website, with Deporia installed](https://i.imgur.com/huH6nhr.png)

![Safe image on reddit](https://i.imgur.com/ZqNBtoG.png)

![AI image on reddit](https://i.imgur.com/cNKuzeG.png)

## Video Demo

TODO

## Inspiration

We were inspired by the following crowdsourced safety solutions:

- [Microsoft SmartScreen](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/)
- [Google Safe Browsing](https://safebrowsing.google.com/)
- [Twitter/X Community Notes](https://communitynotes.x.com/guide/en/about/introduction)
- [Shinigami Eyes](https://shinigami-eyes.github.io/)

## What it does

* Users vote "trust" or "distrust" on flagged images by right clicking on images
* Displays the current "trustworthiness" of an image with a colored border ranging from red to green
* Requires very little effort
  * This was a key design goal, since we realized that >85% of people were not going to want to jump through hoops
  * Keeping the design as accessible as possible will enable more people to be aware of if media they consume is AI-generated or not

## How we built it

* Frontend: Browser extension (JS, WebExtension API, & Firefox)
* Backend: FastAPI with async endpoints, hosted on **Vultr** and brought up with a systemd unit
* Storage: **Valkey** for fast key-value lookups

You can try out the project by downloading the extension from [our GitHub repository](https://github.com/regulad/Hack_NCState2026/tree/master/deporia-frontend).

## Challenges we ran into

* Couldn't get a `.tech` domain, even through GitHub Student Pack; We pivoted into using ngrok which required custom headers on every request.
  * This was an issue since we used the `crypto.subtle` Web APIs for hashing, which require the site to be loaded in an HTTPS context.
  * Let's Encrypt and other services could have let us get a TLS certificate on the `.tech` domain quickly. We had preferred running Fedora on the VPS, but since Certbot is primarily distributed as a snap we instead chose Ubuntu
  * We would have loved `deporia.tech` if `.tech` had been working: short & easy to pronounce
* Vultr took a while to setup, but once setup it worked well
* When we tried all hitting the server at once, it was possible to get the server to write invalid reputations to the database.
  * We fixed the race condition with thread-safe updates provided by  `aiorwlock` to do R/W locking that let us keep speed high.
* SHA256 hash matching requires exact pixel match - minor edits/reencoding create new hashes.
* CORS (Cross-origin resource sharing) made it difficult for our extension to get images out of webpages
  * We had to do some deep dives into Browser API documentation to learn why we were experiencing the errors we were, and what we needed to do instead
  * Final solution works reliably, but it took a good chunk of our devtime

## Accomplishments that we're proud of

* Built a working crowdsourced reputation system in 24 hours
* Clean async API in Python with proper concurrency control
* Making use of the **Valkey** and **Vultr** tracks organically rather than simply shoving them in for extra points 
* Very simple and low-cognitive-load UI
* Made our first WebExtension
* We made minimal use of LLMs in our dev process
  * We used Claude primarily as a "souped-up search engine"
  * Paraphrasing sample code snippets ourselves rather than blind vibe coding left us with a much better understanding of what our code did and why web architecture is structured the way it currently is
* Collaborated effectively with Git & a GitHub repository

## What we learned

* Valkey was a good pick for this use case
  * Fast + simple = nothing better
  * Let us focus on the important parts rather than how data would be stored, if we had used a relational DB we would have spent more time worrying about how to store data and what to store
* Crowdsourcing works but needs critical mass of users
  * We believe that since "early adopters" tend to be more technical, they tend to be better at identifiying AI-manipulated images too
  * This will help bootstrap our project with good quality ratings early on
  * Whenever the extension sees an image for the first time, it marks it as "somewhat trustworthy" which may cause a user to put trust into a publication that is manipulated
* Hash-based identification is fast but brittle to image edits
  * We had planned to re-encode all images to JPEG before hashing, but the lossy compression behaved a little different on every computer and didn't produce the same hash

## What's next for Deporia

* Perceptual hashing (one solution is called pHash) to catch edited versions of same image or same image in different encoding
  * We want to keep image hashing client-side for privacy, but this also makes spoofing easier
  * TPM/Attestation solution could work, but browser APIs aren't available broadly yet
* Video / Audio flagging
* ML model to provide initial reputation score before community votes, currently it starts out at a flat "70%" or "somewhat trustworthy"
  * Alternatively, we could also choose to abstain from showing a rating until enough people have rated the image
  * This is how some of our inspirations (notably Google Safe Browsing) work
* Better spoofing detection to prevent reputation manipulation, currently just a simple rate-limit
* Publishing & on Chrome extension store to reach more users through organic sharing
* Accessibility-friendly way to share reputation rating
  * Currently we just attach an aria label to each image we modify
  * None of us personally use screen readers, so we would like to get in contact with someone who does to learn what works best for them
