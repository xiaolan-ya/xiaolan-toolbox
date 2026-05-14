(function () {
  window.XIAOLAN_APP_CONFIG = {
    appName: "小蓝工具箱",
    defaultPrompt: `这是一张艾尔登法环史诗级黑暗奇幻风格的杂志封面。画面中心是一位背对观者的角色，拥有及腰的银白色长发，发丝随风飘动，身披华丽厚重的深红色丝绒长袍，袍子上有精致的金色刺绣和装饰链条。人物把黄金律法大剑抬起对准王座。

人物站在宏伟的台阶下方，正面朝一座艾尔登法环风格的内部空间，台阶向上延伸至一个被神圣光芒笼罩的王座。建筑极其恢弘，充满复杂雕刻、高耸立柱、拱顶结构与悬挂的旗帜，整体呈现艾尔登法环的风格。

光线从高处倾泻而下，形成强烈的体积光效果，空气中漂浮着金色尘埃与火星，营造神圣、庄严且压迫的氛围。整体色调以金色与深红色为主，高对比度，电影级光影，细节极其丰富，超写实质感。

画面采用杂志封面设计风格：顶部有大标题“ELDEN KING”（红色大号衬线字体），画面左侧有分栏小标题与装饰性图标，底部带有条形码和设计排版元素，整体排版高级、平衡、具有专业出版感。右下角有斜着的 by xiaolan的红色手写体

构图为居中对称，利用台阶作为引导线，增强纵深感和史诗感，人物披风具有强烈动态效果。`,
    rendererGenerationTimeoutMs: 315000,
    rendererMultiGenerationExtraTimeoutMs: 180000,
    rendererReferenceExtraTimeoutMs: 30000,
    maxReferenceImages: 16,
    maxGenerationCount: 16,
    maxEditorHistory: 24,
    sizeLabels: {
      auto: "自动（默认）",
      "1024x1024": "1K（1024×1024）",
      "1536x1024": "1.5K（1536×1024）",
      "1024x1536": "1.5K（1024×1536）",
      "2048x2048": "2K（2048×2048）",
      "2048x1152": "2K（2048×1152）",
      "3840x2160": "4K（3840×2160）",
      "2160x3840": "4K（2160×3840）",
    },
    sizeChipDetails: {
      auto: { title: "自动", resolution: "交给模型判断" },
      "1024x1024": { ratio: "1:1", shape: "ratio-square", badge: "1K", resolution: "1024×1024" },
      "1536x1024": { ratio: "3:2", shape: "ratio-landscape", badge: "1.5K", resolution: "1536×1024" },
      "1024x1536": { ratio: "2:3", shape: "ratio-portrait", badge: "1.5K", resolution: "1024×1536" },
      "2048x2048": { ratio: "1:1", shape: "ratio-square", badge: "2K", resolution: "2048×2048" },
      "2048x1152": { ratio: "16:9", shape: "ratio-wide", badge: "2K", resolution: "2048×1152" },
      "3840x2160": { ratio: "16:9", shape: "ratio-wide", badge: "4K", resolution: "3840×2160" },
      "2160x3840": { ratio: "9:16", shape: "ratio-tall", badge: "4K", resolution: "2160×3840" },
    },
  };
})();
