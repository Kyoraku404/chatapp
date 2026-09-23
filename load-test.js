import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
};

export default function () {
  const res = http.get("https://rush-ocn.vercel.app/");

  check(res, {
    "status 200": (r) => r.status === 200,
    "under 2 seconds": (r) => r.timings.duration < 2000,
  });

  sleep(1);
}
