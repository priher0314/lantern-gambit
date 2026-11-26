extends Node
## 저장 시스템 (autoload: Save).
## 프로필(도감·명성·해금·설정)과 휴게소별 저장 슬롯을 따로 관리한다.
## 저장은 임시 파일에 쓴 뒤 바꿔치기하고, 직전 정상 저장을 .bak 으로 남긴다.

const PROFILE_VERSION := 1
const PROFILE_PATH := "user://profile.json"
const MAX_SLOTS := 6

var profile: Dictionary = {}
var dir_override: String = ""     # 테스트용 저장 폴더

func _ready() -> void:
	load_profile()

func _p(path: String) -> String:
	if dir_override != "":
		return dir_override.path_join(path.get_file())
	return path

func default_profile() -> Dictionary:
	return {
		"version": PROFILE_VERSION, "fame": 0, "fame_spent": 0, "unlocks": [], "codex": {}, "awards": [], "trophies": [],
		"records": {}, "slots": [], "next_slot": 1, "tutorial_done": false, "completions": 0,
		"settings": {"music": 0.6, "sfx": 0.8, "amb": 0.5, "ui_scale": 0, "fullscreen": false, "lang": "ko"},
	}

# ---------------------------------------------------------------- 파일 입출력

func _write_json(path: String, data: Dictionary) -> bool:
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_error("저장 실패(열기): %s" % tmp)
		return false
	f.store_string(JSON.stringify(data))
	f.close()
	# 쓴 내용을 다시 읽어 확인한 뒤에만 기존 파일을 바꾼다
	if _read_json(tmp).is_empty():
		push_error("저장 실패(검증): %s" % tmp)
		return false
	var da := DirAccess.open(path.get_base_dir())
	if da == null:
		return false
	if FileAccess.file_exists(path):
		if FileAccess.file_exists(path + ".bak"):
			da.remove(path + ".bak")
		da.rename(path, path + ".bak")
	var err := da.rename(tmp, path)
	return err == OK

func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var txt := FileAccess.get_file_as_string(path)
	var json := JSON.new()
	if json.parse(txt) != OK:
		return {}
	if json.data is Dictionary:
		return json.data
	return {}

## 본 파일이 깨졌으면 백업에서 복구한다.
func _read_with_backup(path: String) -> Dictionary:
	var d := _read_json(path)
	if d.is_empty() and FileAccess.file_exists(path + ".bak"):
		push_warning("저장 파일 손상 — 백업에서 복구: %s" % path)
		d = _read_json(path + ".bak")
	return d

# ---------------------------------------------------------------- 프로필

func load_profile() -> void:
	var d := _read_with_backup(_p(PROFILE_PATH))
	var base := default_profile()
	if d.is_empty():
		profile = base
		return
	d = _migrate_profile(d)
	for k in base:
		if not d.has(k):
			d[k] = base[k]
	for k in base["settings"]:
		if not d["settings"].has(k):
			d["settings"][k] = base["settings"][k]
	d["fame"] = int(d["fame"])
	d["fame_spent"] = int(d["fame_spent"])
	d["next_slot"] = int(d["next_slot"])
	profile = d

func _migrate_profile(d: Dictionary) -> Dictionary:
	var v := int(d.get("version", 1))
	# 버전이 올라가면 여기서 단계별로 변환한다: if v == 1: ...; v = 2
	d["version"] = maxi(v, PROFILE_VERSION)
	return d

func save_profile() -> bool:
	return _write_json(_p(PROFILE_PATH), profile)

func fame_available() -> int:
	return int(profile["fame"]) - int(profile["fame_spent"])

func is_unlocked(unlock_id: String) -> bool:
	return (profile["unlocks"] as Array).has(unlock_id)

func buy_unlock(unlock_id: String) -> bool:
	if is_unlocked(unlock_id):
		return false
	for u in Data.progression["unlocks"]:
		if u["id"] == unlock_id:
			if fame_available() < int(u["cost"]):
				return false
			profile["fame_spent"] = int(profile["fame_spent"]) + int(u["cost"])
			(profile["unlocks"] as Array).append(unlock_id)
			save_profile()
			return true
	return false

func region_unlocked(region_id: String) -> bool:
	if not (Data.progression["locked_by_default"]["regions"] as Array).has(region_id):
		return true
	return _unlocked_targets("region").has(region_id)

func challenge_unlocked(challenge_id: String) -> bool:
	return _unlocked_targets("challenge").has(challenge_id)

func _unlocked_targets(type: String) -> Array:
	var out: Array = []
	for u in Data.progression["unlocks"]:
		if u["type"] == type and is_unlocked(u["id"]):
			if u["target"] is Array:
				out.append_array(u["target"])
			else:
				out.append(u["target"])
	return out

## 시뮬레이션에 넘겨줄 영구 해금 목록
func unlocks_for_sim() -> Dictionary:
	return {"perks": _unlocked_targets("perks"), "facilities": _unlocked_targets("facility")}

func codex_add(cat: String, id: String) -> bool:
	var cx: Dictionary = profile["codex"]
	if not cx.has(cat):
		cx[cat] = []
	if (cx[cat] as Array).has(id):
		return false
	(cx[cat] as Array).append(id)
	return true

func codex_has(cat: String, id: String) -> bool:
	var cx: Dictionary = profile["codex"]
	return cx.has(cat) and (cx[cat] as Array).has(id)

## 명성 보상은 휴게소(슬롯)마다 한 번만 지급된다.
func award_fame(slot_id: int, award_id: String, fame: int) -> bool:
	var key := "%d:%s" % [slot_id, award_id]
	if (profile["awards"] as Array).has(key):
		return false
	(profile["awards"] as Array).append(key)
	profile["fame"] = int(profile["fame"]) + fame
	return true

func add_trophy(id: String) -> bool:
	if (profile["trophies"] as Array).has(id):
		return false
	(profile["trophies"] as Array).append(id)
	return true

func record_best(key: String, value: float, lower_is_better: bool = true) -> bool:
	var rec: Dictionary = profile["records"]
	if not rec.has(key) or (lower_is_better and value < float(rec[key])) or (not lower_is_better and value > float(rec[key])):
		rec[key] = value
		return true
	return false

# ---------------------------------------------------------------- 슬롯

func slot_path(id: int) -> String:
	return _p("user://slot_%d.json" % id)

func slots() -> Array:
	return profile["slots"]

func slot_meta(id: int) -> Dictionary:
	for s in slots():
		if int(s["id"]) == id:
			return s
	return {}

func can_create_slot() -> bool:
	return slots().size() < MAX_SLOTS

func create_slot() -> int:
	var id := int(profile["next_slot"])
	profile["next_slot"] = id + 1
	(profile["slots"] as Array).append({"id": id, "summary": {}})
	return id

func save_slot(id: int, sim: Sim) -> bool:
	var ok := _write_json(slot_path(id), sim.to_dict())
	if ok:
		var m := slot_meta(id)
		if m.is_empty():
			m = {"id": id, "summary": {}}
			(profile["slots"] as Array).append(m)
		m["summary"] = sim.summary()
		m["saved_at"] = Time.get_datetime_string_from_system()
		save_profile()
	return ok

func load_slot(id: int) -> Dictionary:
	var d := _read_with_backup(slot_path(id))
	if d.is_empty():
		return {}
	return _migrate_slot(d)

func _migrate_slot(d: Dictionary) -> Dictionary:
	var v := int(d.get("version", 1))
	# 저장 형식이 바뀌면 여기서 단계별로 변환한다.
	d["version"] = maxi(v, Sim.SAVE_VERSION)
	return d

func delete_slot(id: int) -> void:
	var da := DirAccess.open(slot_path(id).get_base_dir())
	if da != null:
		for suffix in ["", ".bak", ".tmp"]:
			if FileAccess.file_exists(slot_path(id) + suffix):
				da.remove(slot_path(id) + suffix)
	profile["slots"] = (profile["slots"] as Array).filter(func(s): return int(s["id"]) != id)
	save_profile()
