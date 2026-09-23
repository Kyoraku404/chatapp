import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 100,
  duration: "30s",
};

export default function () {
  const res = http.get("https://rush-ashen-iota.vercel.app/login");
  check(res, {
    "login status 200": (r) => r.status === 200,
    "login under 2s": (r) => r.timings.duration < 2000,
  });
  sleep(1);
}
