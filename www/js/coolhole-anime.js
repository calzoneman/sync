// FIX: Should be driven via theme tokens
const GAIN_TEXT_COLOR = "#15b015";
const LOSS_TEXT_COLOR = "#dd1b1b";
const GAIN_BUTTON_COLOR = "#158415";
const LOSS_BUTTON_COLOR = "#dd1b1b";

function coolpointsButtonGainAnime(ptsEl, msgEl, points, btnEl = null) {
  msgEl.text(`+${points} CP`);
  const tl = gsap.timeline();
  if (btnEl) tl.add(glowGreen(btnEl));
  tl.add(bounce(btnEl || ptsEl), "<");
  tl.add(fadeMessage(msgEl, GAIN_TEXT_COLOR), "<");
  return tl;
}

function coolpointsButtonLossAnime(ptsEl, msgEl, points, btnEl = null) {
  msgEl.text(`${points} CP`);
  const tl = gsap.timeline();
  if (btnEl) tl.add(glowRed(btnEl));
  tl.add(shake(btnEl || ptsEl), "<");
  tl.add(fadeMessage(msgEl, LOSS_TEXT_COLOR), "<");
  return tl;
}

function glowGreen(el) {
  const tl = gsap.timeline({
    defaults: { duration: 0.5 },
  });

  tl.fromTo(
    el,
    /* 
    HACK: We need the original background color to tween from but due to multiple themes, we can't hardcode it
    so we use 'revert-layer' to get the original color via the css engine. 
    This doesn't work for the cyborg theme for some reason.
    */
    { backgroundColor: "revert-layer" },
    { backgroundColor: GAIN_BUTTON_COLOR, yoyo: true, repeat: 1 }
  ).to(el, { clearProps: "background-color" });

  return tl;
}

function glowRed(el) {
  const tl = gsap.timeline({
    defaults: { duration: 0.5 },
  });

  tl.fromTo(
    el,
    /* 
    HACK: We need the original background color to tween from but due to multiple themes, we can't hardcode it
    so we use 'revert-layer' to get the original color via the css engine. 
    This doesn't work for the cyborg theme for some reason.
    */
    { backgroundColor: "revert-layer" },
    { backgroundColor: LOSS_BUTTON_COLOR, yoyo: true, repeat: 1 }
  ).to(el, { clearProps: "background-color" });

  return tl;
}

function bounce(el) {
  return gsap
    .timeline({ defaults: { ease: "power1.inOut", duration: 0.1 } })
    .to(el, { y: -5 })
    .to(el, { y: 0 })
    .to(el, { y: -3 })
    .to(el, { y: 0 })
    .to(el, { clearProps: "y" });
}

function shake(el) {
  return gsap
    .timeline({ defaults: { duration: 0.08 } })
    .to(el, { x: -5 })
    .to(el, { x: 5 })
    .to(el, { x: -5 })
    .to(el, { x: 5 })
    .to(el, { x: 3 })
    .to(el, { x: -3 })
    .to(el, { x: 0 })
    .to(el, { clearProps: "x" });
}

function fadeIn(el) {
  return gsap.fromTo(
    el,
    { opacity: 0 },
    { opacity: 1, duration: 0.8, ease: "power1.inOut" },
    { clearProps: "opacity" }
  );
}

function fadeMessage(el, color) {
  const tl = gsap.timeline();

  tl.set(el, { color });

  tl.fromTo(
    el,
    { opacity: 0 },
    { opacity: 1, duration: 1.3 * 0.2, ease: "power1.inOut" }
  );

  tl.to(el, { opacity: 0, duration: 1.3 * 0.8, ease: "power1.inOut" });

  return tl;
}
