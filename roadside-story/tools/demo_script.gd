extends RefCounted
## 개발용: 봇으로 며칠 경영한 뒤 한낮(또는 --hour=시)으로 맞춘다. 화면 캡처 검증에 쓴다.
## 사용: -- --newgame --script=res://tools/demo_script.gd --days=40 --strategy=balanced --shot=out.png

func run(game: Game) -> void:
	var args := {"days": "30", "strategy": "balanced", "hour": "13", "zoom": "1"}
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=")
		if kv.size() > 1:
			args[kv[0]] = kv[1]
	var sim := game.sim
	var ai := AIPlayer.new(sim, args["strategy"])
	var steps := int(float(args["days"]) * sim.day_len() / 0.1)
	for i in steps:
		sim.step(0.1)
		if i % 50 == 0:
			ai.act()
		if i % 2000 == 0:
			await game.get_tree().process_frame
	var guard := 0
	while absf(sim.hour() - float(args["hour"])) > 0.3 and guard < 1000:
		sim.step(0.1)
		guard += 1
	game.set_zoom(int(args["zoom"]))
	game.hud.modal_queue.clear()
	if game.hud.modal_open:
		game.hud.close_modal()
	game.hud.modal_queue.clear()
	if args.has("select"):
		for f in sim.facilities.values():
			if f.id == args["select"]:
				game.select(f.uid)
				game.focus_on(f.center())
				break
	if args.has("place"):
		game.begin_place(args["place"])
