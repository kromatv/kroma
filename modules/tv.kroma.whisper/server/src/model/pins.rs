pub(super) struct Model {
    pub(super) spec: &'static str,
    pub(super) revision: &'static str,
    pub(super) config: &'static str,
    pub(super) weights: &'static str,
}

pub(super) const TOKENIZER: &str =
    "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566";

pub(super) const MODELS: &[Model] = &[
    Model {
        spec: "openai/whisper-tiny",
        revision: "169d4a4341b33bc18d8881c4b69c2e104e1cc0af",
        config: "ffdccec4f3211f4c63310f2b7098f309fe70f3952cedc5e4d11e43f5b2379b98",
        weights: "7ebd0e69e78190ffe1438491fa05cc1f5c1aa3a4c4db3bc1723adbb551ea2395",
    },
    Model {
        spec: "openai/whisper-base",
        revision: "e37978b90ca9030d5170a5c07aadb050351a65bb",
        config: "a153c53883a6799b6f056b4a8d1a515c9926d03994682ba88a7616618d7da0c1",
        weights: "07cadb9f25677c8d50df603e66a98fbd842cce45047139baeb16e6219a1e807b",
    },
    Model {
        spec: "openai/whisper-small",
        revision: "973afd24965f72e36ca33b3055d56a652f456b4d",
        config: "e6a2b489da1b5aed65a8eb8d1e7466fa867ad5643a8bc138ba708bd56b2875c4",
        weights: "1d7734884874f1a1513ed9aa760a4f8e97aaa02fd6d93a3a85d27b2ae9ca596b",
    },
];
