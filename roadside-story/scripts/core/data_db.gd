extends Node
## 콘텐츠 데이터베이스 (autoload: Data).
## data/*.json 을 읽어 고유 ID로 조회할 수 있게 한다. 게임 로직은 여기의 값을 읽기만 한다.

var balance: Dictionary = {}
var facilities: Dictionary = {}      # id -> def
var facility_order: Array = []
var products: Dictionary = {}
var product_order: Array = []
var ingredients: Dictionary = {}
var ingredient_order: Array = []
var recipes: Dictionary = {}         # "a+b" (정렬된 키) -> product id
var customer_types: Dictionary = {}
var customer_order: Array = []
var synergies: Dictionary = {}
var synergy_order: Array = []
var perks: Dictionary = {}
var perk_order: Array = []
var combos: Dictionary = {}
var combo_order: Array = []
var regions: Dictionary = {}
var region_order: Array = []
var jobs: Dictionary = {}
var job_order: Array = []
var traits: Dictionary = {}
var trait_order: Array = []
var staff_names: Dictionary = {}
var events: Dictionary = {}
var event_order: Array = []
var progression: Dictionary = {}
var challenges: Dictionary = {}

const CATEGORIES := ["basic", "food", "shop", "tour", "car", "relax", "family", "deco"]
const CATEGORY_NAMES := {"basic": "기초", "food": "음식", "shop": "쇼핑", "tour": "관광", "car": "차량", "relax": "휴양", "family": "가족", "deco": "장식"}
const NEED_NAMES := {"food": "식사", "drink": "음료", "snack": "간식", "toilet": "화장실", "rest": "휴식", "shop": "쇼핑", "fun": "놀 거리", "view": "볼거리"}
const FAME_STAGE_NAMES := ["일반 상품", "인기 상품", "지역 명물", "전국 명물", "전설적인 상품"]
const SEASON_NAMES := {"spring": "봄", "summer": "여름", "fall": "가을", "winter": "겨울"}

func _ready() -> void:
	load_all()

func _read(path: String) -> Variant:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("데이터 파일을 열 수 없음: " + path)
		return null
	var json := JSON.new()
	var err := json.parse(f.get_as_text())
	if err != OK:
		push_error("JSON 오류 %s (줄 %d): %s" % [path, json.get_error_line(), json.get_error_message()])
		return null
	return json.data

func _index(list: Array, into: Dictionary, order: Array) -> void:
	into.clear()
	order.clear()
	for d in list:
		into[d["id"]] = d
		order.append(d["id"])

func load_all() -> void:
	balance = _read("res://data/balance.json")
	_index(_read("res://data/facilities.json"), facilities, facility_order)
	var pj: Dictionary = _read("res://data/products.json")
	_index(pj["products"], products, product_order)
	_index(pj["ingredients"], ingredients, ingredient_order)
	recipes.clear()
	for pid in product_order:
		var p: Dictionary = products[pid]
		if p.has("recipe"):
			recipes[recipe_key(p["recipe"][0], p["recipe"][1])] = pid
	_index(_read("res://data/customer_types.json"), customer_types, customer_order)
	_index(_read("res://data/synergies.json"), synergies, synergy_order)
	var kj: Dictionary = _read("res://data/perks.json")
	_index(kj["perks"], perks, perk_order)
	_index(kj["combos"], combos, combo_order)
	_index(_read("res://data/regions.json"), regions, region_order)
	var sj: Dictionary = _read("res://data/staff.json")
	_index(sj["jobs"], jobs, job_order)
	_index(sj["traits"], traits, trait_order)
	staff_names = {"surnames": sj["surnames"], "given": sj["given"]}
	_index(_read("res://data/events.json"), events, event_order)
	progression = _read("res://data/progression.json")
	challenges.clear()
	for c in progression["challenges"]:
		challenges[c["id"]] = c

func recipe_key(a: String, b: String) -> String:
	return a + "+" + b if a < b else b + "+" + a

func bal(key: String) -> Variant:
	return balance[key]

func rank_def(rank: int) -> Dictionary:
	var ranks: Array = balance["ranks"]
	return ranks[clampi(rank, 1, ranks.size()) - 1]

func max_rank() -> int:
	return (balance["ranks"] as Array).size()

## 데이터 무결성 검사. 테스트에서 호출한다. 문제 목록을 돌려준다.
func validate() -> Array:
	var errs: Array = []
	for fid in facility_order:
		var f: Dictionary = facilities[fid]
		for pid in f.get("products", []):
			if not products.has(pid):
				errs.append("시설 %s: 없는 상품 %s" % [fid, pid])
			elif not (products[pid]["at"] as Array).has(fid):
				errs.append("시설 %s 의 기본 상품 %s 가 at 목록에 없음" % [fid, pid])
	for pid in product_order:
		var p: Dictionary = products[pid]
		for fid in p["at"]:
			if not facilities.has(fid):
				errs.append("상품 %s: 없는 시설 %s" % [pid, fid])
		if p.has("recipe"):
			for ing in p["recipe"]:
				if not ingredients.has(ing):
					errs.append("상품 %s: 없는 재료 %s" % [pid, ing])
		if p["cost"] > p["price"]:
			errs.append("상품 %s: 원가가 가격보다 큼" % pid)
	for sid in synergy_order:
		for group in synergies[sid]["req"]:
			for fid in group:
				if not facilities.has(fid):
					errs.append("궁합 %s: 없는 시설 %s" % [sid, fid])
	for cid in combo_order:
		for pk in combos[cid]["need"]:
			if not perks.has(pk):
				errs.append("조합 %s: 없는 특전 %s" % [cid, pk])
	for rid in region_order:
		var r: Dictionary = regions[rid]
		for pb in r["prebuilt"]:
			if not facilities.has(pb["id"]):
				errs.append("지역 %s: 없는 시설 %s" % [rid, pb["id"]])
		for t in r["types"]:
			if not customer_types.has(t):
				errs.append("지역 %s: 없는 손님 유형 %s" % [rid, t])
	return errs
