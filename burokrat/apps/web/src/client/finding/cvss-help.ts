import type { CvssMetric } from "@burokrat/domain";

const NONE_LOW_HIGH = (what: string) => ({
  N: `No ${what}.`,
  L: `Some ${what}, limited in reach or control.`,
  H: `Total ${what}, or a serious loss from what is reachable.`,
});

/** What each CVSS 4.0 base metric asks, and what each answer means. */
export const CVSS_HELP: Record<CvssMetric, { about: string; values: Record<string, string> }> = {
  AV: {
    about: "How close the attacker must be to the vulnerable system.",
    values: {
      N: "Over the network, including the internet.",
      A: "From the same local network, Bluetooth range or VPN.",
      L: "Through a local session, or by tricking a local user.",
      P: "By touching the device.",
    },
  },
  AC: {
    about: "Whether the attack must defeat a security measure the attacker does not control.",
    values: {
      L: "Works every time without bypassing protections.",
      H: "Needs to defeat a protection such as ASLR or obtain a secret first.",
    },
  },
  AT: {
    about: "Whether the attack depends on deployment conditions outside the attacker's control.",
    values: {
      N: "Works regardless of how the system is deployed.",
      P: "Needs a race to be won, or a specific configuration or network position.",
    },
  },
  PR: {
    about: "The access the attacker needs before attacking.",
    values: {
      N: "No account or access.",
      L: "A basic user account.",
      H: "Administrative or significant control.",
    },
  },
  UI: {
    about: "Whether someone other than the attacker must take part.",
    values: {
      N: "No one else has to do anything.",
      P: "A user only has to behave normally, such as visiting a page.",
      A: "A user has to take a deliberate step, such as opening a file or dismissing a warning.",
    },
  },
  VC: {
    about: "Confidentiality lost on the vulnerable system itself.",
    values: NONE_LOW_HIGH("information disclosed"),
  },
  VI: {
    about: "Integrity lost on the vulnerable system itself.",
    values: NONE_LOW_HIGH("data the attacker can modify"),
  },
  VA: {
    about: "Availability lost on the vulnerable system itself.",
    values: NONE_LOW_HIGH("disruption of service"),
  },
  SC: {
    about: "Confidentiality lost on other systems the vulnerable one connects to.",
    values: NONE_LOW_HIGH("information disclosed"),
  },
  SI: {
    about: "Integrity lost on other systems the vulnerable one connects to.",
    values: NONE_LOW_HIGH("data the attacker can modify"),
  },
  SA: {
    about: "Availability lost on other systems the vulnerable one connects to.",
    values: NONE_LOW_HIGH("disruption of service"),
  },
};
