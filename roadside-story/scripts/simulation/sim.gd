class_name Sim
extends RefCounted
## 휴게소 한 곳의 시뮬레이션 전체. 화면 표시와 완전히 분리되어 있어 headless 로도 돌아간다.
## 화면은 event 시그널과 공개 상태를 읽어서 그린다.

signal event(kind: String, data: Dictionary)

const SAVE_VERSION := 1

var rng := RandomNumberGenerator.new()
var seed_value: int = 0
var region_id: String = "rural"
var region: Dictionary = {}
var stop_name: String = "새 휴게소"
var challenge_id: String = ""
var challenge: Dictionary = {}

var time: float = 0.0          # 누적 게임 시간(초)
var money: float = 0.0
var next_uid: int = 1

var grid := WorldGrid.new()
var facilities: Dictionary = {}    # uid -> Facility
var fac_list: Array = []           # 순회용

var build: Construction
var cust: CustomerSystem
var econ: Economy
var staff: StaffSystem
var products: ProductSystem
var synergy: SynergySystem
var perks: PerkSystem
var prog: ProgressionSystem
var events: EventSystem

var dirty: bool = true
var mods: Dictionary = {}          # 궁합·특전·이벤트가 합쳐진 전역 보정값
var draw_total: float = 0.0
var profile_unlocks: Dictionary = {}   # 프로필에서 넘겨받은 영구 해금 (perks/facilities)
var last_action: String = ""

var _acc: float = 0.0

func _init() -> void:
	build = Construction.new(self)
	cust = CustomerSystem.new(self)
	econ = Economy.new(self)
	staff = StaffSystem.new(self)
	products = ProductSystem.new(self)
	synergy = SynergySystem.new(self)
	perks = PerkSystem.new(self)
	prog = ProgressionSystem.new(self)
	events = EventSystem.new(self)

# ---------------------------------------------------------------- 시작 / 불러오기

func new_game(p_region: String, p_name: String, p_seed: int, p_challenge: String = "", unlocks: Dictionary = {}) -> void:
	region_id = p_region
	region = Data.regions[p_region]
	stop_name = p_name
	seed_value = p_seed
	rng.seed = p_seed
	challenge_id = p_challenge
	challenge = Data.challenges.get(p_challenge, {})
	profile_unlocks = unlocks
	money = float(challenge.get("mods", {}).get("start_money", Data.balance["start_money"]))
	grid.setup(region)
	grid.walk_cb = _walk_cb
	products.init_defaults()
	for cell in region.get("paths", []):
		grid.set_path(int(cell[0]), int(cell[1]), true)
	for pb in region["prebuilt"]:
		build.place(pb["id"], int(pb["pos"][0]), int(pb["pos"][1]), 0, true)
	staff.refresh_candidates()
	prog.init_new()
	recalc()

func _walk_cb(uid: int) -> bool:
	var f: Facility = facilities.get(uid)
	return f != null and f.is_walkable()

func new_uid() -> int:
	next_uid += 1
	return next_uid - 1

func emit(kind: String, data: Dictionary = {}) -> void:
	event.emit(kind, data)

# ---------------------------------------------------------------- 시간

func day_len() -> float:
	return float(Data.balance["day_len"])

func day() -> int:
	return int(floor(time / day_len()))

func day_frac() -> float:
	return fposmod(time, day_len()) / day_len()

## 0~24 시. 하루는 06시에 시작한다.
func hour() -> float:
	return fposmod(day_frac() * 24.0 + 6.0, 24.0)

func month_index() -> int:
	return int(day() / int(Data.balance["days_per_month"]))

func month() -> int:
	return (month_index() + int(Data.balance["start_month"]) - 1) % 12 + 1

func year() -> int:
	return int((month_index() + int(Data.balance["start_month"]) - 1) / 12) + 1

func day_of_month() -> int:
	return day() % int(Data.balance["days_per_month"]) + 1

func season() -> String:
	var m := month()
	if m >= 3 and m <= 5:
		return "spring"
	if m >= 6 and m <= 8:
		return "summer"
	if m >= 9 and m <= 11:
		return "fall"
	return "winter"

func date_text() -> String:
	return "%d년차 %d월 %d일" % [year(), month(), day_of_month()]

## 밤의 정도 0(낮)~1(한밤)
func night_factor() -> float:
	var hr := hour()
	if hr >= 7.0 and hr <= 17.5:
		return 0.0
	if hr > 17.5 and hr < 20.5:
		return (hr - 17.5) / 3.0
	if hr >= 5.0 and hr < 7.0:
		return 1.0 - (hr - 5.0) / 2.0
	return 1.0

func is_night() -> bool:
	return night_factor() > 0.6

# ---------------------------------------------------------------- 틱

## 실제 경과 시간(초)만큼 진행. speed 는 배속. 고정 틱으로 나눠 돌린다.
func advance(real_dt: float, speed: float) -> void:
	_acc += real_dt * speed
	var tick: float = Data.balance["tick"]
	var guard := 0
	while _acc >= tick and guard < 60:
		_acc -= tick
		step(tick)
		guard += 1
	if guard >= 60:
		_acc = 0.0

func step(dt: float) -> void:
	if dirty:
		recalc()
	var d0 := day()
	var n0 := is_night()
	time += dt
	if is_night() != n0:
		dirty = true
	cust.tick(dt)
	products.tick(dt)
	if day() != d0:
		_on_new_day()
	prog.tick(dt)

func _on_new_day() -> void:
	econ.close_day()
	staff.on_new_day()
	events.on_new_day()
	prog.on_new_day()
	dirty = true
	emit("new_day", {"day": day()})

func mark_dirty() -> void:
	dirty = true

## 시설 배치·레벨·직원·특전이 바뀌면 파생 수치를 한꺼번에 다시 계산한다.
func recalc() -> void:
	dirty = false
	fac_list = facilities.values()
	mods = {"traffic": 0.0, "attract": {}, "visits": 0, "rep": 0.0, "fuel": 0.0, "night": 0.0}
	synergy.recalc()
	perks.recalc()
	for f in fac_list:
		build.recalc_facility(f)
	perks.post_recalc()
	events.apply_mods()
	draw_total = 0.0
	for f in fac_list:
		var d: Dictionary = f.def()
		draw_total += float(d.get("draw", 0)) * f.appeal * (1.0 + 0.06 * (f.level - 1))
	draw_total += products.fame_draw()
	cust.recalc_types()

func add_mod(key: String, v: float) -> void:
	mods[key] = float(mods.get(key, 0.0)) + v

func add_attract(type_id: String, v: float) -> void:
	var a: Dictionary = mods["attract"]
	a[type_id] = float(a.get(type_id, 0.0)) + v

# ---------------------------------------------------------------- 돈

func can_afford(amount: float) -> bool:
	return money >= amount

func spend(amount: float, why: String = "") -> bool:
	if money < amount:
		return false
	money -= amount
	econ.note_spend(amount, why)
	return true

func earn(amount: float) -> void:
	money += amount

# ---------------------------------------------------------------- 조회

func fac(uid: int) -> Facility:
	return facilities.get(uid)

func count_fac(def_id: String) -> int:
	var n := 0
	for f in fac_list:
		if f.id == def_id:
			n += 1
	return n

func has_fac(def_id: String) -> bool:
	return count_fac(def_id) > 0

func facility_unlocked(def_id: String) -> bool:
	var d: Dictionary = Data.facilities[def_id]
	if int(d.get("rank", 1)) > prog.rank:
		return false
	var locked: Array = Data.progression["locked_by_default"]["facilities"]
	if locked.has(def_id) and not (profile_unlocks.get("facilities", []) as Array).has(def_id):
		return false
	return true

func build_cost(def_id: String) -> float:
	return roundf(float(Data.facilities[def_id]["cost"]) * float(region.get("cost_mult", 1.0)) / 500.0) * 500.0

# ---------------------------------------------------------------- 저장

func to_dict() -> Dictionary:
	var facs: Array = []
	for f in facilities.values():
		facs.append(f.to_dict())
	return {
		"version": SAVE_VERSION,
		"region": region_id, "name": stop_name, "seed": seed_value, "rng_state": str(rng.state),
		"challenge": challenge_id, "time": time, "money": money, "next_uid": next_uid,
		"grid": grid.to_dict(), "facilities": facs,
		"cust": cust.to_dict(), "econ": econ.to_dict(), "staff": staff.to_dict(),
		"products": products.to_dict(), "synergy": synergy.to_dict(), "perks": perks.to_dict(),
		"prog": prog.to_dict(), "events": events.to_dict(), "last_action": last_action,
	}

func load_dict(d: Dictionary, unlocks: Dictionary = {}) -> void:
	region_id = d["region"]
	region = Data.regions[region_id]
	stop_name = d["name"]
	seed_value = int(d["seed"])
	rng.seed = seed_value
	rng.state = int(d["rng_state"])
	challenge_id = d.get("challenge", "")
	challenge = Data.challenges.get(challenge_id, {})
	profile_unlocks = unlocks
	time = float(d["time"])
	money = float(d["money"])
	next_uid = int(d["next_uid"])
	last_action = d.get("last_action", "")
	grid.setup(region)
	grid.walk_cb = _walk_cb
	facilities.clear()
	for fd in d["facilities"]:
		var f := Facility.from_dict(fd)
		facilities[f.uid] = f
		grid.set_occ(f.rect(), f.uid)
	grid.load_dict(d["grid"], region)
	products.load_dict(d["products"])
	staff.load_dict(d["staff"])
	synergy.load_dict(d["synergy"])
	perks.load_dict(d["perks"])
	prog.load_dict(d["prog"])
	events.load_dict(d["events"])
	econ.load_dict(d["econ"])
	cust.load_dict(d["cust"])
	recalc()

## 상태 요약 (저장 슬롯 목록·복귀 요약에 사용)
func summary() -> Dictionary:
	return {
		"name": stop_name, "region": region_id, "rank": prog.rank, "year": year(), "month": month(),
		"money": money, "visitors": prog.visitors, "style": prog.style_name(), "challenge": challenge_id,
		"complete": prog.run_complete, "last_action": last_action,
	}
