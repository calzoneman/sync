$("#cp-slots-spin-btn").on("click", handleSpinButtonClick);

function handleSpinButtonClick() {
  const bet = parseInt($("#cp-slots-bet-input").val(), 10);
  if (isNaN(bet) || bet <= 0) {
    alert("Please enter a valid bet amount.");
    return;
  }

  const data = { bet };

  socket.emit("coolholeSpinSlot", data);
}

function buildReels(grid) {
  const root = $("#cp-slots-reels");
  root.empty();
  // ascii grid for debugging
  const gridString = grid.map((row) => row.join(" ")).join("\n");
  const pre = $("<pre>").text(gridString);
  root.append(pre);

  $("#cp-slots-spin-btn").prop("disabled", false);
}

function handleSlotSpinResponse(response) {
  const { grid, totalPayout, hits } = response;
  buildReels(grid);
  const resultGrid = $(".cp-slots-result-grid");
  const resultGridPre = $("<pre>").text(`${JSON.stringify(hits, null, 2)}`);
  resultGrid.prepend(resultGridPre);

  const resultMessage = $(".cp-slots-result-message");
  const resultMessagePre = $("<pre>").text(
    `Won ${totalPayout} from ${hits.map((h) => h.pattern).join(", ")}`
  );
  resultMessage.prepend(resultMessagePre);

  // TODO: Update only once the reel animation finishes
  if (totalPayout > 0)
    setTimeout(() => applyPointsToSelf(response.totalPayout), 1000);
}
