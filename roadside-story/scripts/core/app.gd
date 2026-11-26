extends Node
## 앱 전체 흐름 (autoload: App): 화면 전환, 설정 적용, 현재 플레이 중인 휴게소.

const GAME_TITLE := "Roadside Story"   # 가칭. 최종 이름이 정해지면 여기와 project.godot 만 바꾸면 된다.
const VERSION := "0.1.0"

var sim: Sim
var slot_id: int = 0
var dev_mode: bool = false
var main: Node
var screen: Node

func _ready() -> void:
	dev_mode = OS.is_debug_build() and not OS.has_feature("release")
	if "--no-dev" in OS.get_cmdline_user_args():
		dev_mode = false
	get_window().min_size = Vector2i(854, 480)
	get_window().size_changed.connect(apply_scale)
	apply_settings()

func settings() -> Dictionary:
	return Save.profile["settings"]

func apply_settings() -> void:
	var s := settings()
	Audio.apply_volumes(s)
	Loc.set_lang(s.get("lang", "ko"))
	if DisplayServer.get_name() != "headless":
		var want_full: bool = s.get("fullscreen", false)
		var is_full := get_window().mode == Window.MODE_FULLSCREEN or get_window().mode == Window.MODE_EXCLUSIVE_FULLSCREEN
		if want_full != is_full:
			get_window().mode = Window.MODE_FULLSCREEN if want_full else Window.MODE_MAXIMIZED
	apply_scale()

## 픽셀이 뭉개지지 않도록 화면 배율은 항상 정수.
func auto_scale() -> int:
	var sz := get_window().size
	return maxi(1, mini(int(sz.x / 854.0), int(sz.y / 470.0)))

func apply_scale() -> void:
	var user: int = int(settings().get("ui_scale", 0))
	var sc := auto_scale() if user <= 0 else user
	sc = clampi(sc, 1, maxi(1, mini(int(get_window().size.x / 640.0), int(get_window().size.y / 360.0))))
	get_window().content_scale_factor = float(sc)

func view_size() -> Vector2:
	return Vector2(get_window().size) / get_window().content_scale_factor

# ---------------------------------------------------------------- 화면 전환

func _swap(node: Node) -> void:
	if screen != null:
		screen.queue_free()
	screen = node
	main.add_child(node)

func show_menu() -> void:
	sim = null
	slot_id = 0
	_swap(MainMenu.new())

func start_new(region_id: String, stop_name: String, challenge_id: String = "", seed_value: int = -1) -> void:
	slot_id = Save.create_slot()
	sim = Sim.new()
	_hook_profile(sim)
	if seed_value < 0:
		seed_value = int(Time.get_unix_time_from_system()) % 1000000007
	sim.new_game(region_id, stop_name, seed_value, challenge_id, Save.unlocks_for_sim())
	Save.save_slot(slot_id, sim)
	_swap(Game.new())

func load_game(id: int) -> bool:
	var d := Save.load_slot(id)
	if d.is_empty():
		return false
	slot_id = id
	sim = Sim.new()
	_hook_profile(sim)
	sim.load_dict(d, Save.unlocks_for_sim())
	_swap(Game.new())
	return true

func save_current() -> bool:
	if sim == null or slot_id == 0:
		return false
	return Save.save_slot(slot_id, sim)

## 휴게소에서 일어난 발견·보상을 프로필(통합 도감, 명성)에 반영한다.
func _hook_profile(s: Sim) -> void:
	s.event.connect(func(kind: String, d: Dictionary):
		match kind:
			"discover":
				var is_new := Save.codex_add(d["cat"], d["id"])
				d["new"] = is_new
			"fame_award":
				d["granted"] = Save.award_fame(slot_id, d["id"], int(d["fame"]))
				Save.save_profile()
			"trophy":
				Save.add_trophy(d["id"])
			"run_complete":
				Save.profile["completions"] = int(Save.profile["completions"]) + 1
				Save.profile["tutorial_done"] = true
				Save.record_best("days_%s%s" % [s.region_id, ("_" + s.challenge_id) if s.challenge_id != "" else ""], float(d["day"]))
				Save.save_profile()
			"rank_up":
				Save.record_best("rank_%s" % s.region_id, float(d["rank"]), false)
				if int(d["rank"]) >= 2:
					Save.profile["tutorial_done"] = true
			"challenge_done":
				Save.record_best("challenge_%s" % d["id"], float(d["day"]))
	)
