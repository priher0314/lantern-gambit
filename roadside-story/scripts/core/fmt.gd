class_name Fmt
## 숫자·날짜 표시 도우미.

static func comma(n: int) -> String:
	var s := str(absi(n))
	var out := ""
	var cnt := 0
	for i in range(s.length() - 1, -1, -1):
		out = s[i] + out
		cnt += 1
		if cnt % 3 == 0 and i > 0:
			out = "," + out
	return ("-" if n < 0 else "") + out

static func won(n: float) -> String:
	return comma(int(round(n))) + "원"

## 좁은 곳에 쓰는 줄임 표기 (12.5만, 3.2억)
static func won_short(n: float) -> String:
	var v := absf(n)
	var sign_s := "-" if n < 0 else ""
	if v >= 100000000.0:
		return sign_s + _trim(v / 100000000.0) + "억"
	if v >= 10000.0:
		return sign_s + _trim(v / 10000.0) + "만"
	return sign_s + comma(int(round(v)))

static func _trim(x: float) -> String:
	if x >= 100.0:
		return comma(int(round(x)))
	var s := "%.1f" % x
	if s.ends_with(".0"):
		s = s.substr(0, s.length() - 2)
	return s

static func stars(n: int, max_n: int = 5) -> String:
	return "★".repeat(clampi(n, 0, max_n)) + "☆".repeat(max_n - clampi(n, 0, max_n))

static func pct(x: float) -> String:
	return "%d%%" % int(round(x * 100.0))

static func signed_pct(x: float) -> String:
	return ("+" if x >= 0 else "") + "%d%%" % int(round(x * 100.0))
