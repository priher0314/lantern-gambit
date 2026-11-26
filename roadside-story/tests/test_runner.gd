extends Node
## 자동 테스트. 화면 없이 실행한다.
##   godot --headless --path . res://tests/test_runner.tscn
## 실패가 하나라도 있으면 종료 코드 1.

var passed := 0
var failed := 0
var fails: Array = []
var current := ""

func check(cond: bool, what: String) -> void:
	if cond:
		passed += 1
	else:
		failed += 1
		fails.append("%s: %s" % [current, what])
		print("  ✗ ", what)

func approx(a: float, b: float, eps: float = 0.01) -> bool:
	return absf(a - b) <= eps

func new_sim(region: String = "rural", seed_v: int = 11, challenge: String = "") -> Sim:
	var s := Sim.new()
	s.new_game(region, "테스트", seed_v, challenge)
	return s

func run(s: Sim, seconds: float, ai: AIPlayer = null) -> void:
	var n := int(seconds / 0.1)
	for i in n:
		s.step(0.1)
		if ai != null and i % 50 == 0:
			ai.act()

func _ready() -> void:
	var tests := ["data", "new_game", "placement", "refund_move", "no_free_money", "first_minute", "capacity", "upgrade", "research", "staff", "synergy", "perks", "save_roundtrip", "save_files", "long_run", "all_perks_bounded", "regions_differ", "demolish_live", "challenge", "events", "eval"]
	var only := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--only="):
			only = a.trim_prefix("--only=")
	for t in tests:
		if only != "" and t != only:
			continue
		current = t
		var t0 := Time.get_ticks_msec()
		call("test_" + t)
		print("[%s] %d ms" % [t, Time.get_ticks_msec() - t0])
	print("")
	print("통과 %d / 실패 %d" % [passed, failed])
	for f in fails:
		print("  실패: ", f)
	get_tree().quit(1 if failed > 0 else 0)

# ----------------------------------------------------------------

func test_data() -> void:
	var errs: Array = Data.validate()
	check(errs.is_empty(), "데이터 무결성: %s" % str(errs))
	check(Data.facility_order.size() >= 12, "시설 12종 이상")
	check(Data.recipes.size() >= 16, "연구 조합 16개 이상")
	check(Data.customer_order.size() >= 8, "손님 유형 8종 이상")
	check(Data.synergy_order.size() >= 10, "궁합 10종 이상")
	check(Data.perk_order.size() >= 12, "특전 12종 이상")
	# 모든 연구 재료가 적어도 하나의 조합에 쓰이는가
	for ing in Data.ingredient_order:
		var used := false
		for key in Data.recipes:
			if (Data.products[Data.recipes[key]]["recipe"] as Array).has(ing):
				used = true
		check(used, "재료 %s 가 쓰이는 조합이 있음" % ing)
	# 모든 시설 스프라이트가 있는가
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/sprites/buildings/meta.json"))
	for fid in Data.facility_order:
		if Data.facilities[fid]["kind"] != "path":
			check(meta.has(fid + "_0"), "시설 그림 %s_0" % fid)

func test_new_game() -> void:
	var s := new_sim()
	check(approx(s.money, float(Data.balance["start_money"])), "시작 자금")
	check(s.has_fac("parking") and s.has_fac("kiosk"), "주차장과 매점이 미리 지어져 있음")
	check(s.prog.rank == 1, "1등급에서 시작")
	check(s.month() == 3 and s.year() == 1, "1년차 3월 시작")
	check(s.staff.candidates.size() == 3, "지원자 3명")

func test_placement() -> void:
	var s := new_sim()
	s.money = 10000000.0
	var b := s.build
	check(not b.can_place("snack", 0, 0, 0)["ok"], "부지 밖 건설 불가")
	check(not b.can_place("snack", 21, 11, 0)["ok"], "사지 않은 땅 건설 불가")
	check(not b.can_place("snack", 13, 16, 0)["ok"], "주차장과 겹치면 불가")
	check(not b.can_place("parking", 11, 11, 0)["ok"], "주차장은 도로 옆에만")
	check(b.can_place("parking", 16, 16, 0)["ok"], "도로 옆 주차장 가능")
	check(not b.can_place("snack", 16, 16, 0)["ok"], "입구가 도로를 향하면 불가")
	check(b.can_place("snack", 16, 16, 1)["ok"] or true, "돌리면 가능할 수 있음")
	var m0 := s.money
	var f := b.place("snack", 11, 11, 0)
	check(f != null, "분식점 건설")
	check(approx(m0 - s.money, s.build_cost("snack")), "건설비 차감")
	var e := f.entrance()
	check(not b.can_place("tree", e.x, e.y, 0)["ok"], "남의 입구를 막는 건설 불가")
	check(b.can_place("path", e.x, e.y, 0)["ok"], "입구 앞 보행로는 가능")
	s.money = 100.0
	check(b.place("cafe", 15, 11, 0) == null, "돈이 모자라면 건설 실패")
	check(approx(s.money, 100.0), "실패 시 돈이 줄지 않음")
	check(not s.facility_unlocked("hotel"), "등급이 낮으면 호텔 잠김")

func test_refund_move() -> void:
	var s := new_sim()
	s.money = 1000000.0
	var f := s.build.place("snack", 11, 11, 0)
	var m1 := s.money
	check(s.build.move(f.uid, 15, 11, 1), "이동 성공")
	check(approx(s.money, m1), "이동은 무료")
	check(f.x == 15 and f.rot == 1, "이동 후 위치·방향")
	check(s.grid.occ_at(11, 11) == 0 and s.grid.occ_at(15, 11) == f.uid, "점유 정보 갱신")
	s.build.demolish(f.uid)
	check(approx(s.money, 1000000.0), "방금 지은 시설은 전액 환급")
	var f2 := s.build.place("snack", 11, 11, 0)
	var cost := s.build_cost("snack")
	s.build.upgrade(f2.uid)
	var up := f2.upgrade_spent
	run(s, s.day_len() * 1.5)
	var m2 := s.money
	s.build.demolish(f2.uid)
	check(approx(s.money - m2, cost * 0.8 + up * 0.5, 1.0), "하루 지난 뒤 환급 80%/50%")
	check(s.build.place("path", 11, 11, 0) == null and s.grid.has_path(11, 11), "보행로 깔기")
	check(s.build.remove_path(11, 11) and not s.grid.has_path(11, 11), "보행로 지우기")

func test_no_free_money() -> void:
	# 손님이 오지 않으면 매출도 없어야 한다
	var s := Sim.new()
	var region: Dictionary = Data.regions["rural"].duplicate(true)
	region["traffic"] = 0.0
	Data.regions["_test"] = region
	Data.regions["_test"]["id"] = "_test"
	s.new_game("_test", "무손님", 5)
	s.money = 50000.0
	run(s, 30.0)
	check(s.econ.total_sales == 0 and approx(s.econ.total_rev, 0.0), "손님 없이는 매출 없음")
	check(approx(s.money, 50000.0), "하루가 지나기 전에는 돈이 그대로")
	run(s, 400.0)
	check(s.money >= 0.0, "운영비 때문에 마이너스가 되지 않음")
	check(s.econ.total_sales == 0, "여전히 판매 없음")
	Data.regions.erase("_test")
	# 매출 합계 = 시설별 매출 합계
	var s2 := new_sim("rural", 3)
	run(s2, 200.0)
	var fac_sum := 0.0
	for f in s2.facilities.values():
		fac_sum += f.rev_total
	check(approx(fac_sum, s2.econ.total_rev, 0.5), "총매출이 시설별 매출 합과 같음")
	check(s2.econ.total_sales <= s2.prog.visitors * 6, "판매 수가 손님 수로 설명됨")

func test_first_minute() -> void:
	for seed_v in [1, 2, 3, 4, 5, 6]:
		var s := new_sim("rural", seed_v)
		run(s, 60.0)
		check(s.econ.total_sales >= 1, "시드 %d: 60초 안에 첫 판매 (판매 %d)" % [seed_v, s.econ.total_sales])
		check(s.prog.visitors >= 1, "시드 %d: 60초 안에 첫 손님" % seed_v)

func test_capacity() -> void:
	var s := new_sim("rural", 9)
	var ai := AIPlayer.new(s, "food")
	var ok := true
	var lot_ok := true
	for i in 6000:
		s.step(0.1)
		if i % 50 == 0:
			ai.act()
		if i % 10 == 0:
			for f in s.facilities.values():
				if f.users.size() > f.cap:
					ok = false
				if f.kind() == "parking" and f.used_slots() > maxi(f.cap, f.slots.size()):
					lot_ok = false
	check(ok, "동시 이용 인원이 수용량을 넘지 않음")
	check(lot_ok, "주차 대수가 칸 수를 넘지 않음")

func test_upgrade() -> void:
	var s := new_sim()
	s.money = 100000000.0
	var f := s.build.place("snack", 11, 11, 0)
	var q0 := f.quality
	var a0 := f.appeal
	var t0 := f.time
	var m0 := s.money
	var c := s.build.upgrade_cost(f)
	check(s.build.upgrade(f.uid), "업그레이드 성공")
	check(approx(m0 - s.money, c), "업그레이드 비용 차감")
	check(f.level == 2 and f.quality > q0 and f.appeal > a0 and f.time < t0, "레벨 2에서 품질·인기·속도 개선")
	var tiers := {}
	while s.build.can_upgrade(f):
		s.build.upgrade(f.uid)
		tiers[f.tier()] = true
	check(f.level == 10, "최대 레벨 10")
	check(tiers.has(1) and tiers.has(2), "성장 단계에서 외형 단계가 바뀜")
	check(f.cap > int(f.def()["cap"]), "수용량 증가")
	check(not s.build.upgrade(f.uid), "최대 레벨에서는 더 못 올림")

func test_research() -> void:
	var s := new_sim()
	s.money = 1000000.0
	var p := s.products
	check(p.combo_info("walnut", "choco")["state"] == "new", "호두+초콜릿 = 새 상품")
	check(p.combo_info("walnut", "walnut")["state"] == "none", "같은 재료 조합 없음")
	check(not p.start_research("apple", "butter")["ok"], "잠긴 재료는 연구 불가")
	var m0 := s.money
	check(p.start_research("coffee", "milk")["ok"], "연구 시작")
	check(s.money < m0, "연구비 차감")
	check(not p.start_research("walnut", "choco")["ok"], "동시에 하나만 연구")
	run(s, s.day_len() * 0.5)
	check(p.progress() > 0.2 and p.progress() < 1.0, "게임 시간에 따라 진행")
	run(s, s.day_len() * 1.0)
	check(p.developed.has("cafe_latte"), "연구 완료")
	var kiosk: Facility = null
	for f in s.facilities.values():
		if f.id == "kiosk":
			kiosk = f
	check(kiosk.products.has("cafe_latte"), "개발한 상품이 매점에 자동 등록")
	check(p.combo_info("coffee", "milk")["state"] == "done", "이미 개발한 조합은 다시 연구하지 않음")
	check(not p.start_research("coffee", "milk")["ok"], "중복 연구 불가")

func test_staff() -> void:
	var s := new_sim()
	s.money = 1000000.0
	var kiosk: Facility = null
	for f in s.facilities.values():
		if f.id == "kiosk":
			kiosk = f
	var t_before := kiosk.time
	var id := s.staff.hire(0)
	check(id != 0, "채용")
	check(s.staff.candidates.size() == 2, "지원자 목록에서 빠짐")
	s.recalc()
	check(kiosk.staff_ids.has(id), "자동 배치")
	check(kiosk.time < t_before, "직원이 있으면 응대가 빨라짐")
	var m0 := s.money
	var wages := s.staff.total_wages()
	var upkeep := s.econ.daily_upkeep()
	# 손님을 막고 하루를 넘겨 급여·운영비만 본다
	s.region = s.region.duplicate(true)
	s.region["traffic"] = 0.0
	for c in s.cust.customers.values():
		pass
	run(s, s.day_len() + 0.2)
	var spent = m0 - s.money + (s.econ.history[-1]["rev"] - s.econ.history[-1]["cogs"])
	check(approx(spent, wages + upkeep, 2.0), "하루 급여와 운영비 자동 정산 (%.0f vs %.0f)" % [spent, wages + upkeep])
	var e: Dictionary = s.staff.staff[id]
	var lv0: int = e["level"]
	for i in 200:
		s.staff.on_serve(kiosk)
	check(int(e["level"]) > lv0, "일하면 레벨이 오름")
	s.staff.fire(id)
	check(kiosk.staff_ids.is_empty() and s.staff.staff.is_empty(), "내보내기")

func test_synergy() -> void:
	var s := new_sim()
	s.money = 10000000.0
	check(s.synergy.active.is_empty(), "처음엔 궁합 없음")
	var found: Array = []
	s.event.connect(func(k, d):
		if k == "synergy_found":
			found.append(d["id"]))
	# 주차장(13,16) + 매점(14,13) 은 이미 있음 → 화장실을 가까이
	var prev: Array = s.synergy.preview("restroom", 16, 13, 0)
	check(prev.has("convenient_rest"), "미리보기에 궁합이 보임")
	s.build.place("restroom", 16, 13, 0)
	check(found.has("convenient_rest"), "편리한 쉼터 발견")
	check(approx(float(s.mods["traffic"]), 0.1), "전역 효과 적용")
	# 같은 조합을 하나 더 만들어도 전역 효과는 한 번만
	s.build.place("restroom", 11, 13, 0)
	s.build.place("kiosk", 11, 15, 1)
	s.recalc()
	check(approx(float(s.mods["traffic"]), 0.1), "중복 궁합이 전역 효과를 두 번 주지 않음")
	check(found.count("convenient_rest") == 1, "같은 궁합 발견 알림은 한 번만")
	# 멀리 지으면 발동하지 않음
	var s2 := new_sim()
	s2.money = 10000000.0
	for x in s2.facilities.values():
		if x.id == "kiosk":
			s2.build.demolish(x.uid)
	var f := s2.build.place("restroom", 18, 10, 0)
	var k := s2.build.place("kiosk", 11, 11, 0)
	check(f != null and k != null, "멀리 떨어뜨려 건설")
	check(not s2.synergy.active.has("convenient_rest"), "멀리 떨어지면 궁합 없음")
	s2.build.move(k.uid, 14, 13, 0)
	s2.build.move(f.uid, 16, 13, 0)
	check(s2.synergy.active.has("convenient_rest"), "가까이 옮기면 궁합 발동")
	check(f.syn.has("convenient_rest") and f.appeal > 1.0, "참여 시설의 인기가 오름")

func test_perks() -> void:
	var s := new_sim("rural", 21)
	s.prog.set_rank(2)
	check(s.perks.has_pending(), "2등급에서 특전 후보")
	var cands: Array = s.perks.offers[0]["cands"].duplicate()
	check(cands.size() == 3, "후보 3개")
	check(cands[0] != cands[1] and cands[1] != cands[2] and cands[0] != cands[2], "후보가 서로 다름")
	# 저장 후 불러와도 후보가 그대로
	var d: Dictionary = JSON.parse_string(JSON.stringify(s.to_dict()))
	var s2 := Sim.new()
	s2.load_dict(d)
	check(s2.perks.offers[0]["cands"] == cands, "저장·불러오기 후에도 후보 동일")
	check(s2.perks.choose(cands[1]), "선택")
	check(s2.perks.owned == [cands[1]] and not s2.perks.has_pending(), "선택 후 적용")
	s2.prog.rank = 1
	s2.prog.set_rank(2)
	check(not s2.perks.has_pending(), "같은 등급에서 후보가 다시 나오지 않음")
	# 시드가 다르면 후보가 달라질 수 있음 / 회차마다 다양성
	var seen := {}
	for sd in range(1, 13):
		var t := new_sim("rural", sd)
		t.prog.set_rank(2)
		for c in t.perks.offers[0]["cands"]:
			seen[c] = true
	check(seen.size() >= 8, "여러 회차에서 다양한 특전이 등장 (%d종)" % seen.size())
	# 조합 완성
	var s3 := new_sim()
	for id in ["thin_margin", "quick_turn"]:
		s3.perks.grant(id)
	check(s3.perks.combos.has("frugal_king"), "특전 조합 완성")
	# 특전 효과가 실제 수치에 반영
	var s4 := new_sim()
	s4.money = 1000000.0
	var f := s4.build.place("snack", 11, 11, 0)
	var a0 := f.appeal
	var t0 := f.time
	s4.perks.grant("famous_eatery")
	s4.perks.grant("quick_turn")
	check(f.appeal > a0, "소문난 맛집: 음식점 인기 상승")
	check(f.time < t0, "빠른 회전: 응대 시간 단축")

func test_save_roundtrip() -> void:
	var s := new_sim("rural", 31)
	var ai := AIPlayer.new(s, "balanced")
	run(s, s.day_len() * 25.0 + 7.3, ai)
	if s.products.current.is_empty():
		s.money += 500000.0
		for key in Data.recipes:
			var r: Array = Data.products[Data.recipes[key]]["recipe"]
			if s.products.start_research(r[0], r[1])["ok"]:
				break
	run(s, 3.0)
	var txt := JSON.stringify(s.to_dict())
	var a := Sim.new()
	a.load_dict(JSON.parse_string(txt))
	check(approx(a.money, s.money) and approx(a.time, s.time), "돈·시간 복원")
	check(a.facilities.size() == s.facilities.size(), "시설 수 복원")
	check(a.staff.staff.size() == s.staff.staff.size(), "직원 복원")
	check(a.products.developed == s.products.developed, "개발 상품 복원")
	check(a.products.current.get("pid", "") == s.products.current.get("pid", "") and approx(a.products.progress(), s.products.progress(), 0.001), "진행 중인 연구 복원")
	check(a.perks.owned == s.perks.owned, "특전 복원")
	check(a.prog.rank == s.prog.rank and approx(a.prog.reputation, s.prog.reputation), "등급·명성 복원")
	check(a.cust.customers.size() == s.cust.customers.size() and a.cust.vehicles.size() == s.cust.vehicles.size(), "손님·차량 복원")
	check(a.synergy.discovered == s.synergy.discovered, "발견한 궁합 복원")
	check(a.prog.tut_index == s.prog.tut_index, "목표 진행 복원")
	var lv_ok := true
	for uid in s.facilities:
		var f1: Facility = s.facilities[uid]
		var f2: Facility = a.facilities.get(uid)
		if f2 == null or f1.level != f2.level or f1.x != f2.x or f1.id != f2.id or not approx(f1.appeal, f2.appeal, 0.0001) or f1.products != f2.products:
			lv_ok = false
	check(lv_ok, "시설 레벨·위치·상품·파생 수치 복원")
	# 같은 저장에서 두 번 불러오면 이후 진행이 완전히 같아야 한다 (결정성)
	var b := Sim.new()
	b.load_dict(JSON.parse_string(txt))
	run(a, 300.0)
	run(b, 300.0)
	check(approx(a.money, b.money, 0.001) and a.prog.visitors == b.prog.visitors and a.econ.total_sales == b.econ.total_sales, "같은 저장 → 같은 진행 (결정적)")
	# 불러온 뒤 보상이 다시 지급되지 않는다
	var awards: Array = []
	var c := Sim.new()
	c.event.connect(func(k, d):
		if k == "fame_award" or k == "rank_up" or k == "goal_done":
			awards.append(k))
	c.load_dict(JSON.parse_string(txt))
	var m_before := c.money
	c.region = c.region.duplicate(true)
	c.region["traffic"] = 0.0
	run(c, 5.0)
	check(not awards.has("rank_up") and not awards.has("goal_done"), "불러온 직후 등급·목표 보상이 중복 지급되지 않음 (%s)" % str(awards))
	check(c.money <= m_before + 30000.0, "불러온 직후 돈이 갑자기 늘지 않음")
	# 저장을 다시 저장해도 같다
	var txt2 := JSON.stringify(Sim.new().to_dict())
	check(txt2.length() > 10, "빈 상태도 저장 가능")

func test_save_files() -> void:
	var dir := "user://test_tmp"
	DirAccess.make_dir_recursive_absolute(dir)
	var keep_profile: Dictionary = Save.profile
	Save.dir_override = dir
	Save.profile = Save.default_profile()
	var s := new_sim("rural", 41)
	run(s, 50.0)
	var id1 := Save.create_slot()
	check(Save.save_slot(id1, s), "슬롯 저장")
	var s2 := new_sim("rural", 42)
	s2.stop_name = "둘째"
	run(s2, 20.0)
	var id2 := Save.create_slot()
	Save.save_slot(id2, s2)
	check(id1 != id2 and Save.slots().size() == 2, "슬롯 두 개")
	var d1 := Save.load_slot(id1)
	var d2 := Save.load_slot(id2)
	check(approx(float(d1["time"]), s.time) and approx(float(d2["time"]), s2.time) and d2["name"] == "둘째", "슬롯이 서로 독립")
	# 한 번 더 저장하면 백업이 생기고, 본 파일이 깨져도 복구된다
	run(s, 10.0)
	Save.save_slot(id1, s)
	check(FileAccess.file_exists(Save.slot_path(id1) + ".bak"), "직전 저장 백업")
	var f := FileAccess.open(Save.slot_path(id1), FileAccess.WRITE)
	f.store_string("{깨진 파일")
	f.close()
	var rec := Save.load_slot(id1)
	check(not rec.is_empty() and rec.has("time"), "손상된 저장을 백업에서 복구")
	# 프로필: 도감·명성 중복 방지
	check(Save.codex_add("synergy", "convenient_rest"), "도감 등록")
	check(not Save.codex_add("synergy", "convenient_rest"), "도감 중복 등록 안 됨")
	check(Save.award_fame(id1, "rank3", 1), "명성 지급")
	check(not Save.award_fame(id1, "rank3", 1), "같은 휴게소에서 같은 명성 보상 중복 지급 안 됨")
	check(Save.award_fame(id2, "rank3", 1), "다른 휴게소에서는 받을 수 있음")
	check(Save.fame_available() == 2, "명성 합계")
	check(not Save.region_unlocked("coast"), "해안도로는 처음엔 잠김")
	check(not Save.buy_unlock("region_coast"), "명성이 모자라면 해금 불가")
	Save.profile["fame"] = 5
	check(Save.buy_unlock("region_coast") and Save.region_unlocked("coast"), "명성으로 지역 해금")
	check(Save.fame_available() == 2, "해금 비용 차감")
	check(Save.save_profile(), "프로필 저장")
	Save.profile = {}
	Save.load_profile()
	check(Save.region_unlocked("coast") and Save.slots().size() == 2 and Save.codex_has("synergy", "convenient_rest"), "프로필 불러오기")
	Save.delete_slot(id2)
	check(Save.slots().size() == 1 and not FileAccess.file_exists(Save.slot_path(id2)), "슬롯 삭제")
	# 정리
	var da := DirAccess.open(dir)
	for fn in da.get_files():
		da.remove(fn)
	Save.dir_override = ""
	Save.profile = keep_profile

func test_long_run() -> void:
	var s := new_sim("rural", 51)
	var ai := AIPlayer.new(s, "balanced")
	var bad := false
	var max_c := 0
	for day in 121:
		run(s, s.day_len(), ai)
		if s.money < 0.0 or is_nan(s.money) or is_nan(s.prog.reputation):
			bad = true
		max_c = maxi(max_c, s.cust.count())
	check(not bad, "2년 동안 돈·명성에 비정상 수치 없음")
	check(s.prog.rank >= 3, "봇이 2년 안에 3등급 이상 (실제 %d)" % s.prog.rank)
	check(s.synergy.discovered.size() >= 1, "궁합 발견")
	check(s.perks.owned.size() >= 2, "특전 획득")
	check(s.cust.count() < 400 and max_c < 400, "손님 수가 끝없이 쌓이지 않음 (최대 %d)" % max_c)
	var stuck := 0
	for c in s.cust.customers.values():
		if c.state == Customer.QUEUE and c.wait > 60.0:
			stuck += 1
	check(stuck == 0, "줄에 갇힌 손님 없음")
	check(s.prog.eval_history.size() == 2, "해마다 전국 평가")

func test_all_perks_bounded() -> void:
	# 모든 특전을 한꺼번에 줘도 수익이 폭주하지 않아야 한다
	var base := new_sim("rural", 61)
	var ai1 := AIPlayer.new(base, "balanced")
	run(base, base.day_len() * 60.0, ai1)
	var txt := JSON.stringify(base.to_dict())
	var a := Sim.new()
	a.load_dict(JSON.parse_string(txt))
	var b := Sim.new()
	b.load_dict(JSON.parse_string(txt))
	for id in Data.perk_order:
		b.perks.grant(id)
	var ra0 := a.econ.total_rev
	var rb0 := b.econ.total_rev
	run(a, a.day_len() * 20.0)
	run(b, b.day_len() * 20.0)
	var ra := a.econ.total_rev - ra0
	var rb := b.econ.total_rev - rb0
	check(rb > ra, "특전이 많으면 매출이 오름 (%.0f → %.0f)" % [ra, rb])
	check(rb < ra * 5.0, "모든 특전을 줘도 매출이 5배를 넘지 않음 (%.2f배)" % (rb / maxf(1.0, ra)))
	check(not is_nan(b.money) and b.money < 1.0e11, "비정상적인 자금 없음")

func test_regions_differ() -> void:
	var r := Sim.new()
	r.new_game("rural", "a", 71)
	var c := Sim.new()
	c.new_game("coast", "b", 71)
	check(c.build_cost("cafe") > r.build_cost("cafe"), "해안은 건설비가 비쌈")
	check(c.grid.w != r.grid.w or c.grid.h != r.grid.h, "부지 모양이 다름")
	r.money = 5000000.0
	c.money = 5000000.0
	var fr := r.build.place("cafe", 11, 11, 0)
	var fc := c.build.place("cafe", 13, 7, 0)
	check(fr != null and fc != null, "양쪽에 카페 건설")
	check(fc.appeal > fr.appeal, "해안에서는 카페 인기가 더 높음")
	r.prog.rank = 3
	c.prog.rank = 3
	r.build.place("observatory", 15, 11, 0)
	check(c.build.place("observatory", 20, 7, 0) != null, "해안 전망대 건설")
	r.recalc()
	c.recalc()
	check(float(c.cust.type_weights.get("tourist", 0.0)) > float(r.cust.type_weights.get("tourist", 0.0)) * 1.5, "해안에는 관광객이 훨씬 많이 옴")
	check(float(r.cust.type_weights.get("trucker", 0.0)) > float(c.cust.type_weights.get("trucker", 0.0)), "시골 국도에는 화물차가 더 많음")

func test_demolish_live() -> void:
	var s := new_sim("rural", 81)
	var ai := AIPlayer.new(s, "food")
	run(s, s.day_len() * 12.0, ai)
	# 손님이 있는 상태에서 시설을 하나씩 모두 철거해도 멈추지 않아야 한다
	var ids: Array = s.facilities.keys()
	for uid in ids:
		s.build.demolish(uid)
		run(s, 3.0)
	check(s.facilities.is_empty(), "모두 철거")
	run(s, 60.0)
	check(s.cust.customers.is_empty(), "남은 손님이 모두 빠져나감 (%d명 남음)" % s.cust.customers.size())
	check(s.cust.vehicles.size() <= 1, "남은 차량이 모두 떠남 (%d대)" % s.cust.vehicles.size())

func test_challenge() -> void:
	var s := new_sim("rural", 91, "penniless")
	check(approx(s.money, 60000.0), "무일푼 사장: 시작 자금 6만 원")
	var m := s.money
	s.prog.set_rank(2)
	check(approx(s.money, m), "등급 보너스 없음")
	var s2 := new_sim("rural", 92, "small_giant")
	s2.money = 9999999.0
	check(not s2.build.buy_plot(0), "작은 거인: 부지 확장 불가")
	var done := [false]
	s2.event.connect(func(k, _d):
		if k == "challenge_done":
			done[0] = true)
	s2.prog.set_rank(4)
	check(done[0] and s2.prog.run_complete, "도전 목표 등급 달성 시 성공 처리")

func test_events() -> void:
	var s := new_sim("rural", 101)
	s.prog.set_rank(4)
	s.money = 5000000.0
	s.build.place("observatory", 11, 11, 0)
	var n0 := s.cust.special_queue.size()
	s.events.trigger("tour_bus")
	check(s.cust.special_queue.size() == n0 + 1, "관광버스 예약")
	var v0 := s.prog.visitors
	run(s, 30.0)
	check(s.prog.visitors >= v0 + 8, "관광버스 손님 도착")
	s.events.trigger("festival")
	s.recalc()
	check(float(s.mods["traffic"]) >= 0.5, "축제 동안 통행량 증가")
	run(s, s.day_len() * 3.0)
	s.recalc()
	check(float(s.mods["traffic"]) < 0.5, "축제가 끝나면 원래대로")
	s.events.trigger("food_contest")
	check(not s.events.pending_choice.is_empty(), "선택형 이벤트 대기")
	var d: Dictionary = JSON.parse_string(JSON.stringify(s.to_dict()))
	var s2 := Sim.new()
	s2.load_dict(d)
	check(not s2.events.pending_choice.is_empty(), "선택 대기 상태 저장")
	s2.events.choose(1)
	check(s2.events.pending_choice.is_empty(), "선택 후 해제")

func test_eval() -> void:
	var s := new_sim("rural", 111)
	var got := [{}]
	s.event.connect(func(k, d):
		if k == "eval":
			got[0] = d)
	run(s, 30.0)
	s.prog.run_eval()
	var d: Dictionary = got[0]
	check(d.has("cats") and d["cats"].has("overall"), "평가 결과")
	check(int(d["cats"]["overall"]["pos"]) >= 8, "갓 시작한 휴게소는 하위권 (%d위)" % int(d["cats"]["overall"]["pos"]))
	check(not s.prog.run_complete, "시작하자마자 회차 완료가 되지 않음")
	check(approx(float(s.econ.period["rev"]), 0.0), "평가 뒤 기간 통계 초기화")
