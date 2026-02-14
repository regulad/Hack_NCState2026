# Deporia

Media aporia no more!

Deporia flags content embedded in webpages likely to be AI-generated or manipulated with a warning icon. AI manipulation reports are submitted by users, and tracked using a backend. Data is stored in Valkey, ensuring fast read/writes and access by image/frame hash.

## Why?

Even the most hardened whiskey-drinking detectives can't always figure out when media is AI-manipulated. This project makes use of crowdsourcing information. Anybody can submit a report if a media is AI-generated or human-generated, and each person is limited to one report per image. 

> This limit is implemented client-side for the purposes of an MVP. A production application would need an account to protect users.

## Example (you must have the extension installed in your browser to see the warning!)

### AI-manipulated image

![Pope francis puffer jacket](https://i.imgur.com/3zZIiwI.png)

### Safe, human-generated image

![Neo-noir](https://i.imgur.com/HuK8Xug.jpeg)

