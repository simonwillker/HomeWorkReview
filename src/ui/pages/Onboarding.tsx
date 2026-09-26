import { useState } from 'react';
import { useStore } from '../../data/store';
import type { User } from '../../domain/types';
import { Modal, useToast } from '../components';
import { navigate } from '../router';

export function Welcome() {
  const { db, run } = useStore();
  const [mode, setMode] = useState<'create' | 'join'>(db.families.length ? 'join' : 'create');
  const [familyName, setFamilyName] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [child, setChild] = useState('');
  const [code, setCode] = useState('');
  const toast = useToast();

  const create = () =>
    toast.attempt(() =>
      run((svc) => {
        const parent = svc.createFamily({ familyName, parentName: name, pin });
        if (child.trim()) svc.addChild(parent, child);
        navigate('/today');
      }),
    );
  const join = () =>
    toast.attempt(() =>
      run((svc) => {
        svc.joinWithInvite({ code, displayName: name, pin });
        navigate('/today');
      }),
    );

  return (
    <div className="welcome">
      <h1>作业检查与复习</h1>
      <p className="lead">记录作业 → 完成与上传 → 检查和订正 → 家长确认 → 按计划复习</p>
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={mode === 'create'} onClick={() => setMode('create')}>
          创建家庭
        </button>
        <button role="tab" aria-selected={mode === 'join'} onClick={() => setMode('join')}>
          用邀请码加入
        </button>
      </div>
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'create') create();
          else join();
        }}
      >
        {mode === 'create' ? (
          <label>
            家庭名称
            <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="例如：我们家" />
          </label>
        ) : (
          <label>
            邀请码（6 位数字）
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
            />
          </label>
        )}
        <label>
          您的称呼（家长）
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：妈妈" />
        </label>
        <label>
          家长 PIN（4–6 位数字）
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            autoComplete="new-password"
          />
          <small>孩子使用同一台设备时，切换到家长身份需要输入 PIN，防止自己确认作业。</small>
        </label>
        {mode === 'create' && (
          <label>
            孩子的称呼（可稍后添加）
            <input value={child} onChange={(e) => setChild(e.target.value)} placeholder="例如：小明" />
          </label>
        )}
        <button className="btn primary" type="submit">
          {mode === 'create' ? '创建并开始' : '加入家庭'}
        </button>
        <p className="hint">不需要真实姓名、学校、位置或通讯录。数据保存在本设备上。</p>
      </form>
      {toast.node}
    </div>
  );
}

export function ProfilePicker() {
  const { db, run } = useStore();
  const [pinFor, setPinFor] = useState<User>();
  const [pin, setPin] = useState('');
  const toast = useToast();
  const choose = (u: User, p?: string) =>
    toast.attempt(() => {
      run((svc) => svc.switchUser(u.id, p));
      setPinFor(undefined);
      setPin('');
      navigate('/today');
    });

  return (
    <div className="welcome">
      <h1>谁在使用？</h1>
      {db.families.map((f) => (
        <section key={f.id} className="profiles">
          <h2>{f.name}</h2>
          <div className="profile-grid">
            {db.users
              .filter((u) => u.familyId === f.id)
              .map((u) => (
                <button
                  key={u.id}
                  className={`profile ${u.role}`}
                  onClick={() => (u.role === 'parent' ? setPinFor(u) : choose(u))}
                >
                  <span className="avatar">{u.displayName.slice(0, 1)}</span>
                  {u.displayName}
                  <small>{u.role === 'parent' ? '家长 · 需 PIN' : '学生'}</small>
                </button>
              ))}
          </div>
        </section>
      ))}
      <a className="link" href="#/join">
        用邀请码加入另一个家庭
      </a>
      {pinFor && (
        <Modal title={`输入 ${pinFor.displayName} 的 PIN`} onClose={() => setPinFor(undefined)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              choose(pinFor, pin);
            }}
          >
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              aria-label="PIN"
            />
            <button className="btn primary" type="submit">
              确定
            </button>
          </form>
        </Modal>
      )}
      {toast.node}
    </div>
  );
}
