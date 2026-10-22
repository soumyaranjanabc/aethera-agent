import torch
import torch.nn as nn
from common import NB


class NameNet(nn.Module):
    """ids [B,T,K] hashed n-grams, shapes [B,T] -> logits [B,T,2] (O, NAME). Receptive field: +-6 tokens."""

    def __init__(self, d=32, h=96):
        super().__init__()
        self.emb = nn.Embedding(NB, d, padding_idx=0)
        self.shape = nn.Embedding(7, 8, padding_idx=0)
        self.c1 = nn.Conv1d(d + 8, h, 5, padding=2)
        self.c2 = nn.Conv1d(h, h, 5, padding=4, dilation=2)
        self.out = nn.Conv1d(h, 2, 1)
        self.drop = nn.Dropout(0.2)

    def forward(self, ids, shapes):
        m = (ids != 0).unsqueeze(-1).float()
        e = (self.emb(ids) * m).sum(2) / m.sum(2).clamp(min=1.0)
        tm = (shapes != 0).unsqueeze(1).float()            # mask padded tokens after every layer,
        x = torch.cat([e, self.shape(shapes)], dim=-1).transpose(1, 2) * tm   # so batch padding never
        h = torch.relu(self.c1(x)) * tm                                       # changes a result
        h = (torch.relu(self.c2(h)) + h) * tm
        return self.out(self.drop(h)).transpose(1, 2)
    