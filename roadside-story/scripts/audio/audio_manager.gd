extends Node
## 소리 (autoload: Audio). 효과음은 같은 소리가 겹쳐 시끄럽지 않게 재생 간격을 제한한다.

const SFX := ["click", "error", "build", "demolish", "path", "upgrade", "sale", "money", "research_done", "discovery", "staff_up", "rank_up", "perk", "codex", "car", "toast", "goal", "jingle"]
const MIN_GAP := {"sale": 0.22, "car": 1.5, "path": 0.05, "click": 0.03, "toast": 0.4, "staff_up": 1.0}

var _streams: Dictionary = {}
var _last: Dictionary = {}
var _players: Array = []
var _next := 0
var _bgm_a: AudioStreamPlayer
var _bgm_b: AudioStreamPlayer
var _bgm_name := ""
var _amb: Dictionary = {}
var enabled := true

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if DisplayServer.get_name() == "headless":
		enabled = false
		return
	for bus in ["Music", "SFX", "Ambience"]:
		if AudioServer.get_bus_index(bus) < 0:
			AudioServer.add_bus()
			AudioServer.set_bus_name(AudioServer.bus_count - 1, bus)
	for n in SFX:
		var path := "res://assets/audio/sfx/%s.wav" % n
		if ResourceLoader.exists(path):
			_streams[n] = load(path)
	for i in 8:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_players.append(p)
	_bgm_a = AudioStreamPlayer.new()
	_bgm_b = AudioStreamPlayer.new()
	for p in [_bgm_a, _bgm_b]:
		p.bus = "Music"
		p.volume_db = -60.0
		add_child(p)
	for n in ["birds", "night", "road"]:
		var path2 := "res://assets/audio/amb/%s.ogg" % n
		if ResourceLoader.exists(path2):
			var p2 := AudioStreamPlayer.new()
			var st: AudioStreamOggVorbis = load(path2)
			st.loop = true
			p2.stream = st
			p2.bus = "Ambience"
			p2.volume_db = -60.0
			add_child(p2)
			_amb[n] = p2

func apply_volumes(settings: Dictionary) -> void:
	if not enabled:
		return
	_set_bus("Music", float(settings.get("music", 0.6)))
	_set_bus("SFX", float(settings.get("sfx", 0.8)))
	_set_bus("Ambience", float(settings.get("amb", 0.5)))

func _set_bus(bus: String, v: float) -> void:
	var i := AudioServer.get_bus_index(bus)
	if i < 0:
		return
	AudioServer.set_bus_mute(i, v <= 0.01)
	AudioServer.set_bus_volume_db(i, linear_to_db(maxf(v, 0.01)))

func play(sfx: String, pitch: float = 1.0) -> void:
	if not enabled or not _streams.has(sfx):
		return
	var now := Time.get_ticks_msec() / 1000.0
	var gap: float = float(MIN_GAP.get(sfx, 0.08))
	if now - float(_last.get(sfx, -10.0)) < gap:
		return
	_last[sfx] = now
	var p: AudioStreamPlayer = _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = _streams[sfx]
	p.pitch_scale = pitch
	p.play()

## 시간대에 맞는 배경음악으로 천천히 넘어간다. name: day / evening / night / ""(끔)
func set_bgm(bgm: String) -> void:
	if not enabled or bgm == _bgm_name:
		return
	_bgm_name = bgm
	var tmp := _bgm_a
	_bgm_a = _bgm_b
	_bgm_b = tmp
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_bgm_b, "volume_db", -60.0, 2.5)
	tw.chain().tween_callback(_bgm_b.stop)
	if bgm == "":
		return
	var path := "res://assets/audio/bgm/%s.ogg" % bgm
	if not ResourceLoader.exists(path):
		return
	var st: AudioStreamOggVorbis = load(path)
	st.loop = true
	_bgm_a.stream = st
	_bgm_a.volume_db = -40.0
	_bgm_a.play()
	create_tween().tween_property(_bgm_a, "volume_db", -6.0, 2.5)

## 환경음 세기 (0~1)
func set_ambience(day: float, night: float, road: float) -> void:
	if not enabled:
		return
	var targets := {"birds": day, "night": night, "road": road}
	for n in _amb:
		var p: AudioStreamPlayer = _amb[n]
		var v: float = float(targets[n])
		if v > 0.02 and not p.playing:
			p.play()
		p.volume_db = lerpf(p.volume_db, linear_to_db(maxf(v, 0.001)), 0.05)
