from common import K, PUNCT, CAP, UPPER, decode, featurize, fnv1a, shape_of, token_ids, tokenize
from gen_data import CLEAN_TEST, CLEAN_TRAIN, POOLS, TEST_T, TRAIN_T
from gen_data import ORGS, wpools

def test_fnv1a_known_vectors():
    assert fnv1a("") == 0x811C9DC5 and fnv1a("a") == 0xE40C292C and fnv1a("foobar") == 0xBF9CF968


def test_tokenize_and_shapes():
    assert [t[0] for t in tokenize("S. Nair's O'Brien")] == ["S", ".", "Nair", "'", "s", "O", "'", "Brien"]
    assert shape_of("S") == CAP and shape_of("MOCKSAT") == UPPER and shape_of(".") == PUNCT and shape_of("ë") == PUNCT


def test_token_ids_fixed_width_and_padded():
    for w in ["a", "Meera", ".", "Supercalifragilisticexpialidocious"]:
        ids = token_ids(w)
        assert len(ids) == K and ids[0] != 0
    assert token_ids(".")[1:] == [0] * (K - 1)


def test_decode_trims_edge_punctuation():
    toks, _, _ = featurize("Nair A. left")
    assert decode(toks, [0.9, 0.9, 0.9, 0.1], 0.5) == [(0, 6)]


def test_name_pools_are_disjoint():
    t, v, e = ({n for pool in POOLS[s] for n in pool} for s in ("train", "val", "test"))
    assert not (t & v) and not (t & e) and not (v & e)
    assert len(POOLS["test"][0]) >= 15 and len(POOLS["test"][1]) >= 8


def test_templates_do_not_overlap():
    assert not set(TRAIN_T) & set(TEST_T) and not set(CLEAN_TRAIN) & set(CLEAN_TEST)

def test_word_pools_disjoint_and_orgs_split():
    p = wpools()
    assert not (set(p["train"]) & set(p["test"])) and not (set(p["train"]) & set(p["val"])) and not (set(p["val"]) & set(p["test"]))
    assert len(p["test"]) >= 20
    assert not set(ORGS["train"]) & set(ORGS["test"])