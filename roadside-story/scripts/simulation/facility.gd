class_name Facility
extends RefCounted
## 맵에 지어진 시설 하나의 런타임 상태.

var uid: int = 0
var id: String = ""          # 시설 정의 ID
var x: int = 0
var y: int = 0
var rot: int = 0             # 0: 입구가 +y(화면 왼쪽 아래), 1: 입구가 +x(화면 오른쪽 아래)
var level: int = 1
var built_day: float = 0.0
var invested: float = 0.0    # 건설비 (환급 계산용)
var upgrade_spent: float = 0.0
var staff_ids: Array = []
var products: Array = []     # 현재 판매 중인 상품 ID
var manual_products: bool = false
var slots: Array = []        # 주차/주유 슬롯: 차량 uid 또는 0
var rev_today: float = 0.0
var rev_yesterday: float = 0.0
var served_today: int = 0
var served_total: int = 0
var rev_total: float = 0.0

# --- 저장하지 않는 런타임/계산 값 ---
var users: Array = []        # 이용 중인 손님 uid
var queue: Array = []        # 줄 선 손님 uid
var incoming: int = 0
var cap: int = 1
var time: float = 3.0
var quality: float = 40.0
var appeal: float = 1.0
var price_mult: float = 1.0
var sat_bonus: float = 0.0
var deco_bonus: float = 0.0
var upkeep: float = 0.0
var syn: Array = []          # 활성 궁합 ID
var stars: int = 1
var reachable: bool = true

const SAVE_FIELDS := ["uid", "id", "x", "y", "rot", "level", "built_day", "invested", "upgrade_spent", "staff_ids", "products", "manual_products", "slots", "rev_today", "rev_yesterday", "served_today", "served_total", "rev_total"]

func def() -> Dictionary:
	return Data.facilities[id]

func w() -> int:
	var s: Array = def()["size"]
	return int(s[1]) if rot == 1 else int(s[0])

func h() -> int:
	var s: Array = def()["size"]
	return int(s[0]) if rot == 1 else int(s[1])

func rect() -> Rect2i:
	return Rect2i(x, y, w(), h())

func center() -> Vector2:
	return Vector2(x + w() * 0.5, y + h() * 0.5)

func kind() -> String:
	return def()["kind"]

func cat() -> String:
	return def()["cat"]

func has_tag(t: String) -> bool:
	return (def().get("tags", []) as Array).has(t)

func max_level() -> int:
	return int(def().get("max_level", 10))

func tier() -> int:
	var tl: Array = Data.balance["tier_levels"]
	var t := 0
	for i in tl.size():
		if level >= int(tl[i]):
			t = i
	# 최대 레벨이 낮은 시설은 비율로 단계 결정
	if max_level() < 10:
		if level >= max_level():
			t = 2
		elif level >= int(ceil(max_level() * 0.5)):
			t = 1
		else:
			t = 0
	return t

## 입구 앞 타일 (손님이 서는 곳)
func entrance() -> Vector2i:
	return entrance_for(def(), x, y, rot)

static func entrance_for(d: Dictionary, px: int, py: int, r: int) -> Vector2i:
	var s: Array = d["size"]
	var fw := int(s[1]) if r == 1 else int(s[0])
	var fh := int(s[0]) if r == 1 else int(s[1])
	if r == 0:
		return Vector2i(px + int((fw - 1) / 2), py + fh)
	return Vector2i(px + fw, py + int((fh - 1) / 2))

## 입구에서 바깥을 향하는 방향 (줄 서는 방향)
func front_dir() -> Vector2:
	return Vector2(0, 1) if rot == 0 else Vector2(1, 0)

func needs_entrance() -> bool:
	return needs_entrance_def(def())

static func needs_entrance_def(d: Dictionary) -> bool:
	var k: String = d["kind"]
	if k == "shop" or k == "free":
		return not d.get("walk", false)
	return false

func is_walkable() -> bool:
	return def().get("walk", false)

## 슬롯(주차 칸, 주유기)의 격자 좌표
func slot_pos(i: int) -> Vector2:
	var fw := w()
	var fh := h()
	if kind() == "fuel":
		return Vector2(x + (i + 0.5) * float(fw) / float(maxi(cap, 1)), y + fh - 0.5)
	var per := fw * fh
	var ti := i % per
	var sub := int(i / per)
	var tx := x + (ti % fw)
	var ty := y + fh - 1 - int(ti / fw)
	var ox := 0.5
	if cap > per:
		ox = 0.29 if sub == 0 else 0.71
	return Vector2(tx + ox, ty + 0.5)

func free_slot() -> int:
	for i in cap:
		if i >= slots.size() or int(slots[i]) == 0:
			return i
	return -1

func set_slot(i: int, veh_uid: int) -> void:
	while slots.size() <= i:
		slots.append(0)
	slots[i] = veh_uid

func used_slots() -> int:
	var n := 0
	for s in slots:
		if int(s) != 0:
			n += 1
	return n

func to_dict() -> Dictionary:
	var d := {}
	for k in SAVE_FIELDS:
		d[k] = get(k)
	return d

static func from_dict(d: Dictionary) -> Facility:
	var f := Facility.new()
	for k in SAVE_FIELDS:
		if d.has(k):
			var v: Variant = d[k]
			if typeof(f.get(k)) == TYPE_INT:
				v = int(v)
			elif typeof(f.get(k)) == TYPE_ARRAY:
				v = (v as Array).duplicate()
			f.set(k, v)
	# JSON은 정수를 실수로 돌려주므로 배열 안의 uid를 정수로 되돌린다
	for i in f.staff_ids.size():
		f.staff_ids[i] = int(f.staff_ids[i])
	for i in f.slots.size():
		f.slots[i] = int(f.slots[i])
	return f
