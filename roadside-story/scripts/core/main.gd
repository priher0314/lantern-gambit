extends Node
## 진입점. 테마를 만들고 메인 메뉴를 띄운다.
## 개발용 인자:  -- --newgame[=지역]  --load=슬롯  --ff=게임초  --shot=파일.png  --open=패널  --quit

func _ready() -> void:
	UIKit.build_theme()
	App.main = self
	var args := {}
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=")
		args[kv[0]] = kv[1] if kv.size() > 1 else ""
	if args.has("fresh"):
		Save.profile = Save.default_profile()
	if args.has("newgame"):
		App.start_new(args["newgame"] if args["newgame"] != "" else "rural", "행복 휴게소", "", int(args.get("seed", "777")))
	elif args.has("load"):
		if not App.load_game(int(args["load"])):
			App.show_menu()
	else:
		App.show_menu()
	if args.has("shot") or args.has("ff") or args.has("script"):
		_auto(args)

func _auto(args: Dictionary) -> void:
	await get_tree().process_frame
	var game = App.screen as Game
	if game != null:
		game.speed = 0.0
		if args.has("script"):
			var s: GDScript = load(args["script"])
			var obj: Object = s.new()
			await obj.call("run", game)
		if args.has("ff"):
			var n := int(float(args["ff"]) / 0.1)
			for i in n:
				App.sim.step(0.1)
				if i % 600 == 0:
					await get_tree().process_frame
		game.speed = 1.0
		if args.has("open"):
			game.hud.open_panel(args["open"])
	for i in int(args.get("frames", "40")):
		await get_tree().process_frame
	if args.has("shot"):
		var img := get_viewport().get_texture().get_image()
		img.save_png(args["shot"])
		print("screenshot saved: ", args["shot"], " ", img.get_size())
	if args.has("shot") or args.has("quit"):
		get_tree().quit()
