extends Node
## 화면 없이 봇으로 휴게소를 경영해 보고 지표를 출력한다. 밸런스 조정용.
## 실행: godot --headless --path . res://tools/sim_runner.tscn -- --strategy=food --region=rural --years=8 --seed=1
##       --strategy=all 이면 여섯 전략을 모두 돌려 비교표를 낸다.  --noperks  --csv=파일

func _ready() -> void:
	var args := {"strategy": "all", "region": "rural", "years": "8", "seed": "1"}
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=")
		args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	var strategies: Array = AIPlayer.STRATEGIES.keys() if args["strategy"] == "all" else [args["strategy"]]
	var rows: Array = []
	for st in strategies:
		rows.append(run_one(st, args["region"], int(args["years"]), int(args["seed"]), args.has("noperks"), args.has("verbose")))
	print("")
	print("전략        | 등급 | 등급별 달성일(2..7)              | 손님    | 총매출      | 자금        | 만족 | 궁합 | 특전조합 | 평가(종합/음식/관광/서비스/실속) | 완료")
	for r in rows:
		print("%-10s | %d    | %-32s | %7d | %11s | %11s | %3d  | %2d   | %d        | %s | %s" % [r["name"], r["rank"], r["rank_days"], r["visitors"], Fmt.won_short(r["rev"]), Fmt.won_short(r["money"]), r["sat"], r["syn"], r["combos"], r["eval"], r["complete"]])
	if args.has("csv"):
		var f := FileAccess.open(args["csv"], FileAccess.WRITE)
		f.store_line("strategy,region,rank,visitors,revenue,money,sat,synergies,combos,complete_day")
		for r in rows:
			f.store_line("%s,%s,%d,%d,%d,%d,%d,%d,%d,%s" % [r["id"], args["region"], r["rank"], r["visitors"], int(r["rev"]), int(r["money"]), r["sat"], r["syn"], r["combos"], r["complete"]])
	get_tree().quit()

static func run_one(strategy: String, region: String, years: int, seed_v: int, noperks: bool = false, verbose: bool = false) -> Dictionary:
	var sim := Sim.new()
	var complete_day := [-1]
	var anomalies: Array = []
	sim.event.connect(func(kind: String, d: Dictionary):
		if kind == "run_complete" and complete_day[0] < 0:
			complete_day[0] = int(d["day"]))
	sim.new_game(region, "봇", seed_v)
	var ai := AIPlayer.new(sim, strategy)
	ai.use_perks = not noperks
	var t0 := Time.get_ticks_msec()
	var total_days := years * 60
	var steps_per_day := int(sim.day_len() / 0.1)
	var max_cust := 0
	for day in total_days:
		for i in steps_per_day:
			sim.step(0.1)
			if i % 50 == 0:
				ai.act()
		max_cust = maxi(max_cust, sim.cust.count())
		if is_nan(sim.money) or sim.money < 0.0:
			anomalies.append("day %d money %f" % [day, sim.money])
		if verbose and (day + 1) % 60 == 0:
			var facs := {}
			for f in sim.facilities.values():
				facs[f.id] = int(facs.get(f.id, 0)) + 1
			print("[%s] %d년차 끝: 등급 %d 손님 %d 명성 %d 자금 %s 일순익 %s 시설 %d 직원 %d 주차 %d 유입 %.2f/s 만족 %d" % [strategy, (day + 1) / 60, sim.prog.rank, sim.prog.visitors, int(sim.prog.reputation), Fmt.won_short(sim.money), Fmt.won_short(sim.econ.recent_avg("net", 10)), sim.facilities.size(), sim.staff.staff.size(), sim.cust.parking_capacity(), sim.cust.arrival_rate(), int(sim.prog.sat_avg)])
	var ev := ""
	if not sim.prog.eval_history.is_empty():
		var pos: Dictionary = sim.prog.eval_history[-1]["pos"]
		ev = "%d/%d/%d/%d/%d" % [pos["overall"], pos["food"], pos["tour"], pos["service"], pos["value"]]
	var rd: Array = []
	for r in range(2, 8):
		rd.append(str(sim.prog.rank_days.get(str(r), "-")))
	if verbose:
		print("[%s] %.1fs 걸림, 최대 동시 손님 %d, 특전 %s, 조합 %s, 궁합 %s" % [strategy, (Time.get_ticks_msec() - t0) / 1000.0, max_cust, str(sim.perks.owned), str(sim.perks.combos), str(sim.synergy.discovered)])
		print("[%s] 손님 구성 %s" % [strategy, str(sim.econ.type_counts)])
		print("[%s] 분야 매출 %s" % [strategy, str(sim.econ.cat_rev)])
		if not anomalies.is_empty():
			print("[%s] 비정상 수치: %s" % [strategy, str(anomalies.slice(0, 5))])
	return {"id": strategy, "name": AIPlayer.STRATEGIES[strategy]["name"], "rank": sim.prog.rank, "rank_days": ",".join(rd), "visitors": sim.prog.visitors, "rev": sim.econ.total_rev, "money": sim.money, "sat": int(sim.prog.sat_avg), "syn": sim.synergy.discovered.size(), "combos": sim.perks.combos.size(), "eval": ev, "complete": str(complete_day[0]), "anomalies": anomalies, "sim": sim}
