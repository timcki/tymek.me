+++
title = "Making my website less boring"
date = 2026-08-17
description = "Adding a liquid, tiltable, tappable WebGL background, and fighting Safari to get it to look exactly how I wanted"
draft = false

[taxonomies]
tags = ["webgl", "shaders", "css", "safari"]
categories = []

[extra]
toc = true
comment = false
copy = true
+++

This site used to be a Serene-theme based static Zola blog, which means pretty boring. While scrolling Bluesky, I saw someone adding a really cool CRT inspired shader-based background (and general theme) to their personal site and I kept thinking about how I wanted mine to be at least a bit as interesting. One CC session of hacking with Fable later and we have the background you're (hopefully) looking at right now. Tap it. If you're on a phone, tilt it (I hope you gave the site motion sensor permission on iOS). This post is about how it works and about a number of Safari-specific problems I ran into.

## The field

The background is a single fullscreen WebGL fragment shader running domain-warped simplex noise. I saw this technique on Inigo Quilez's [warping article](https://iquilezles.org/articles/warp/) while looking for cool shaders on shadertoy.com. Instead of sampling noise at your position `p`, you sample it at `p + fbm(p + fbm(p))`. fbm (fractional Brownian motion) is just several layers of noise stacked at increasing frequency and decreasing amplitude, so the sum has both broad shapes and fine detail. Every level of nesting folds the field into more liquid, organic feeling shapes.

Each of the 5 palette colors (mentioned below) keys its weight on a different component of the warp field, and the weights get raised to a high power, which exaggerates whichever color happens to lead. Each region ends up owned by a single hue. Without that exaggeration you get the arithmetic mean of five colors everywhere and it just looks like a swamp.

## The palette

The colors started from the site's existing accent blue. I took its darker variant (`#6F8FD1`, the dark-mode link color) to [color.adobe.com](https://color.adobe.com) and pulled a split-complementary scheme from it:

<div style="display:flex;gap:4px;border-radius:12px;overflow:hidden;margin:1.5em 0;">
  <div style="flex:1;min-width:0;height:110px;background:#6F8FD1;display:flex;align-items:flex-end;padding:8px;color:#16161e;font-size:0.7em;font-family:var(--code-font);">#6F8FD1</div>
  <div style="flex:1;min-width:0;height:110px;background:#D1BF6F;display:flex;align-items:flex-end;padding:8px;color:#16161e;font-size:0.7em;font-family:var(--code-font);">#D1BF6F</div>
  <div style="flex:1;min-width:0;height:110px;background:#D1A66F;display:flex;align-items:flex-end;padding:8px;color:#16161e;font-size:0.7em;font-family:var(--code-font);">#D1A66F</div>
  <div style="flex:1;min-width:0;height:110px;background:#3F4552;display:flex;align-items:flex-end;padding:8px;color:#faf9f7;font-size:0.7em;font-family:var(--code-font);">#3F4552</div>
  <div style="flex:1;min-width:0;height:110px;background:#524E3F;display:flex;align-items:flex-end;padding:8px;color:#faf9f7;font-size:0.7em;font-family:var(--code-font);">#524E3F</div>
</div>

I used the blue, gold, and tan in the shader but the two dark neutrals didn't show: over a near-black background they're barely above the noise floor, so as "light sources" they just read as murk. In their place I used a rose and a sage, picked by eye to fill the gap between the blue and the warm gold–tan pair and to make the field feel warmer. Blue and gold alone has this deep space/unsettling feel to it. The final shader set, in its dark-mode brightness:

<div style="display:flex;gap:4px;border-radius:12px;overflow:hidden;margin:1.5em 0;">
  <div style="flex:1;min-width:0;height:110px;background:#6F8FD1;display:flex;align-items:flex-end;padding:8px;color:#16161e;font-size:0.7em;font-family:var(--code-font);">#6F8FD1</div>
  <div style="flex:1;min-width:0;height:110px;background:#D1BF6F;display:flex;align-items:flex-end;padding:8px;color:#16161e;font-size:0.7em;font-family:var(--code-font);">#D1BF6F</div>
  <div style="flex:1;min-width:0;height:110px;background:#D1A66F;display:flex;align-items:flex-end;padding:8px;color:#16161e;font-size:0.7em;font-family:var(--code-font);">#D1A66F</div>
  <div style="flex:1;min-width:0;height:110px;background:#D98AA6;display:flex;align-items:flex-end;padding:8px;color:#16161e;font-size:0.7em;font-family:var(--code-font);">#D98AA6</div>
  <div style="flex:1;min-width:0;height:110px;background:#7FC9A6;display:flex;align-items:flex-end;padding:8px;color:#16161e;font-size:0.7em;font-family:var(--code-font);">#7FC9A6</div>
</div>

Light mode uses the same five hues deepened by about fifteen percent, because colors blended into white need extra strength to show.

## Two color models

The interesting part turned out to be that light and dark mode need more than just a slightly stronger palette to look nice. They also require different blending logic. Light mode is a bit like ink on paper, linear-mixing colors toward white desaturates everything into a white mess. Instead, each accent is normalized into a pure tint and multiplied over the paper white. This way saturation survives the whole blend and where the five-color competition produces muddy blends, a chroma gate fades the ink out entirely, so mud becomes white space. On the other hand dark mode is gated glow over black. My first attempts just mixed the same colors over near-black and produced grey soup. The fix was realizing that light mode was accidentally hiding the mud by pushing it into white contrasting spots. Dark mode now does the same thing, but in the opposite direction. Muddy regions get no glow and sink toward true black (the quietest zones hit `#000` exactly, which looks good on OLED), while genuinely-hued regions emit colored light, rimmed with a warm candlelit fade.
What's nice is that even with these differences light and dark still share most of the same diffusion logic and the dark ↔ light transition looks pretty cool and seamless.

## Making it interactive

I wanted the shader to feel alive so a natural choice is make it react to inputs. There's 3 possible interactions:

- Moving the cursor/dragging your finger on the screen makes the shader react. It's done by stirring the noise domain locally and applying a small rotational push with a gaussian falloff that trails behind the pointer/finger.
- Clicking/tapping your finger creates a splash. A transient ring expands with `sqrt(age)` and moves the field radially as it passes. In light mode the tap also deposits a persistent colored stain into a separate 256×256 ping-pong framebuffer simulation, the effect looks a bit like ink soaking into wet paper. In dark mode taps ripple as darkness instead, because glowing circles on black looked like a button press and shadows look more seamless.
- You can also tilt your phone to set a drift velocity. If you hold the phone at an angle the field flows in that direction, speed proportional to the angle. It applies to each warp layer at a different rate, so the big vortex folds should move past the broad color masses (making things look like actual liquid). If you stop moving the phone or put it down, the flow stops and the field returns to normal.

## Fighting Safari

There were two big issues I ran into when trying to make this look nice. One on iOS and the other on desktop.

### Liquid glass

I wanted the shader to show edge-to-edge on iOS, behind the status bar on top and the floating address bar. This turned out to be more hacky than expected. Some surprising things I figured out (hope they'll be helpful to someone in the future):

1. Safari composites real page pixels behind its bars **only when `scrollY > 0`**. At exactly zero you get a flat fallback tint. A page that can't scroll can therefore never have translucent chrome (unless you cheat). I gave the page 160px of hidden scrollable runway, padded the content down to compensate, and pre-scroll past it before first paint. The page looks identical, but it's technically always mid-scroll, and the shader looks nice and continuous on mobile Safari. The tradeoff is that the posts/about/projects subpages can be a bit glitchy when scrolling past the top/bottom but it's a fair tradeoff.
2. Never fight the scroll compositor mid-gesture. iOS delivers scroll events asynchronously from the compositor thread, so any `scrollTo` during momentum lands late and causes shaking. The right hook is `scrollend` (added in Safari 26.2). Let the native rubber-band like animation play out, then ease back once everything has actually stopped.
3. `dvh` units and `window.innerHeight` both *change during the scroll gesture* as the toolbar collapses. If your scroll bounds depend on either, they chase the user's finger. Use `lvh` and compute bounds only at rest.
4. Back-navigation restores from bfcache with a different toolbar state than you left, landing the scroll outside your content zone, and any settle animation that was frozen mid-flight resumes. Clamp instantly on `pageshow`, before the user can see it.

Also, `DeviceOrientationEvent.requestPermission()` silently rejects unless called from a `click` handler (`pointerdown` doesn't count) and a rejected call stores nothing, so if you remove your listener after the first attempt, the feature is just dead forever.

### Performance

Desktop Safari ran the shader at what felt like 5fps while my M1 Macbook Pro was running full throttle. First I assumed it was the fact that the shader didn't stop running in inactive tabs (I had a couple opened in both Safari and Chrome). Implementing that helped with the laptop overheating, but it didn't fix the 5fps situation on Safari. Claude ran some web searches and found that `backdrop-filter` from glass UI might be the problem. Safari re-blurs every glass element's backdrop each canvas frame. Turns out that actually costs us some performance compared to Chrome, but after adding debug metrics I found a pretty obvious problem. My "0.4× resolution" canvas had no absolute pixel cap, and on a 6K display 0.4 × 2 (DPR) works out to 3.76 megapixels × 16 noise evaluations, which is a fair bit of work for one tab. To address that I added a **1.2MP cap** on the drawing buffer, no matter the display. I also added adaptive refresh rate for the animation, full refresh rate only while a user is interacting, half rate for the ambient drift (the tiers are derived from measured vsync intervals, so ProMotion screens get 120/60 and everyone else 60/30). Two other small tweaks that helped were:

- making the ink simulation only run for a few seconds after a tap instead of running forever afterwards
- no synchronous `readPixels` calls, Safari moved WebGL into a separate GPU process, every readback is a blocking IPC round-trip.

Overall the site is now much cooler and less boring, and I actually feel proud of it.
